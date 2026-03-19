import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

const GITHUB_OWNER = "vverzellesi";
const GITHUB_REPO = "expense-control";
const GITHUB_PROJECT_NUMBER = 2;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_IMAGES = 3;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif"];

import { isRateLimited } from "@/lib/rate-limit";

function getGitHubToken(): string | undefined {
  return process.env.GITHUB_TOKEN;
}

function isFileLike(entry: FormDataEntryValue): entry is File {
  return typeof entry === "object" && "arrayBuffer" in entry && "size" in entry && "type" in entry;
}

async function uploadImageToGitHub(
  token: string,
  base64Content: string,
  filename: string
): Promise<string> {
  const path = `bug-attachments/${Date.now()}-${filename}`;

  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        message: `bug-report: add attachment ${filename}`,
        content: base64Content,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to upload image: ${error.message || response.statusText}`
    );
  }

  const data = await response.json();
  return data.content.download_url;
}

async function createGitHubIssue(
  token: string,
  title: string,
  body: string
): Promise<{ number: number; html_url: string; node_id: string }> {
  // Try with label first, fallback without if label doesn't exist
  const payload = { title, body, labels: ["bug"] };

  let response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify(payload),
    }
  );

  // If 422 (likely label doesn't exist), retry without labels
  if (response.status === 422) {
    console.warn("Label 'bug' may not exist, retrying without labels");
    response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify({ title, body }),
      }
    );
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to create issue: ${error.message || response.statusText}`
    );
  }

  return response.json();
}

async function addIssueToProject(token: string, issueNodeId: string): Promise<boolean> {
  const projectQuery = `
    query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          id
        }
      }
    }
  `;

  const projectResponse = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: projectQuery,
      variables: { login: GITHUB_OWNER, number: GITHUB_PROJECT_NUMBER },
    }),
  });

  if (!projectResponse.ok) {
    console.error("Failed to fetch project ID — check GITHUB_TOKEN has 'project' scope");
    return false;
  }

  const projectData = await projectResponse.json();

  if (projectData.errors) {
    console.error("GraphQL errors fetching project:", projectData.errors);
    return false;
  }

  const projectId = projectData.data?.user?.projectV2?.id;

  if (!projectId) {
    console.error("Project not found — verify project number and token permissions");
    return false;
  }

  const mutation = `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: {
        projectId: $projectId
        contentId: $contentId
      }) {
        item {
          id
        }
      }
    }
  `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: mutation,
      variables: { projectId, contentId: issueNodeId },
    }),
  });

  if (!response.ok) {
    console.error("Failed to add issue to project — check token 'project' scope");
    return false;
  }

  const responseData = await response.json();

  if (responseData.errors) {
    console.error("GraphQL errors adding issue to project:", responseData.errors);
    return false;
  }

  return true;
}

async function updateGitHubIssueBody(
  token: string,
  issueNumber: number,
  body: string
): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issueNumber}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({ body }),
    }
  );

  if (!response.ok) {
    console.error("Failed to update issue body with image URLs");
  }
}

function buildIssueBody(
  description: string,
  userAgent: string,
  pageUrl: string,
  imageUrls: string[]
): string {
  let body = description;

  if (imageUrls.length > 0) {
    body += "\n\n### Anexos\n\n";
    imageUrls.forEach((url, index) => {
      body += `![anexo-${index + 1}](${url})\n\n`;
    });
  }

  body += "\n\n---\n\n";
  body += `**Página:** ${pageUrl}\n`;
  body += `**User Agent:** ${userAgent}\n`;
  body += `**Reportado via:** MyPocket Bug Report\n`;

  return body;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

    // Rate limiting
    if (isRateLimited(userId)) {
      return NextResponse.json(
        { error: "Muitos bug reports enviados. Tente novamente em alguns minutos." },
        { status: 429 }
      );
    }

    const token = getGitHubToken();
    if (!token) {
      return NextResponse.json(
        { error: "Configuração do GitHub não encontrada." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const title = formData.get("title") as string | null;
    const description = formData.get("description") as string | null;
    const userAgent = (formData.get("userAgent") as string) || "Unknown";
    const pageUrl = (formData.get("pageUrl") as string) || "Unknown";

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json(
        { error: "Título e descrição são obrigatórios." },
        { status: 400 }
      );
    }

    if (title.trim().length > 200) {
      return NextResponse.json(
        { error: "Título muito longo (máximo 200 caracteres)." },
        { status: 400 }
      );
    }

    if (description.trim().length > 5000) {
      return NextResponse.json(
        { error: "Descrição muito longa (máximo 5000 caracteres)." },
        { status: 400 }
      );
    }

    // Validate images before any external calls
    const imageEntries = formData.getAll("images");

    if (imageEntries.length > MAX_IMAGES) {
      return NextResponse.json(
        { error: `Máximo de ${MAX_IMAGES} imagens permitidas.` },
        { status: 400 }
      );
    }

    const validatedImages: { base64: string; name: string }[] = [];
    for (const entry of imageEntries) {
      if (!isFileLike(entry) || entry.size === 0) continue;

      if (!ALLOWED_IMAGE_TYPES.includes(entry.type)) {
        return NextResponse.json(
          { error: `Tipo de arquivo não suportado: ${entry.type}. Use PNG, JPG ou GIF.` },
          { status: 400 }
        );
      }

      if (entry.size > MAX_IMAGE_SIZE) {
        return NextResponse.json(
          { error: `Imagem "${entry.name}" excede o limite de 5MB.` },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await entry.arrayBuffer());
      const ext = entry.name.split(".").pop() || "png";
      validatedImages.push({
        base64: buffer.toString("base64"),
        name: `${validatedImages.length}.${ext}`,
      });
    }

    // Create issue first (without images), so we never upload orphan attachments
    const body = buildIssueBody(description.trim(), userAgent, pageUrl, []);
    const issue = await createGitHubIssue(token, title.trim(), body);

    // Upload images and update issue body (best-effort for images)
    if (validatedImages.length > 0) {
      const imageUrls: string[] = [];
      for (const img of validatedImages) {
        try {
          const downloadUrl = await uploadImageToGitHub(token, img.base64, img.name);
          imageUrls.push(downloadUrl);
        } catch (uploadError) {
          console.error("Failed to upload image:", uploadError);
        }
      }

      if (imageUrls.length > 0) {
        const updatedBody = buildIssueBody(description.trim(), userAgent, pageUrl, imageUrls);
        await updateGitHubIssueBody(token, issue.number, updatedBody);
      }
    }

    // Add to project board (best-effort — don't fail the request if this fails)
    let projectLinked = false;
    try {
      projectLinked = await addIssueToProject(token, issue.node_id);
    } catch (projectError) {
      console.error("Failed to add issue to project board:", projectError);
    }

    return NextResponse.json({
      success: true,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      projectLinked,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Bug report error:", error);
    return NextResponse.json(
      { error: "Erro ao enviar o bug report. Tente novamente." },
      { status: 500 }
    );
  }
}
