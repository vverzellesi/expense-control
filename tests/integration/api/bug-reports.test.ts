import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// The setup.ts already mocks @/lib/auth-utils, so we import the mocked version
import { getAuthenticatedUserId } from "@/lib/auth-utils";

// Stub env before importing route
vi.stubEnv("GITHUB_TOKEN", "test-token");

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import route after mocks are set up
const { POST } = await import("@/app/api/bug-reports/route");

function createFormData(fields: Record<string, string>, files?: { name: string; content: Buffer; type: string }[]) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  if (files) {
    for (const file of files) {
      const blob = new Blob([file.content], { type: file.type });
      formData.append("images", blob, file.name);
    }
  }
  return formData;
}

function createRequest(formData: FormData) {
  return new NextRequest("http://localhost:3000/api/bug-reports", {
    method: "POST",
    body: formData,
  });
}

describe("/api/bug-reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAuthenticatedUserId as ReturnType<typeof vi.fn>).mockResolvedValue("user-1");
  });

  it("creates a GitHub issue successfully", async () => {
    // Mock issue creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        number: 42,
        html_url: "https://github.com/vverzellesi/expense-control/issues/42",
        node_id: "I_abc123",
      }),
    });

    // Mock project query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: { user: { projectV2: { id: "PVT_123" } } },
      }),
    });

    // Mock add to project
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: { addProjectV2ItemById: { item: { id: "PVTI_123" } } },
      }),
    });

    const formData = createFormData({
      title: "Bug no dashboard",
      description: "O gráfico não carrega",
      userAgent: "Mozilla/5.0",
      pageUrl: "/dashboard",
    });

    const response = await POST(createRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.issueNumber).toBe(42);
    expect(data.issueUrl).toContain("issues/42");
    expect(data.projectLinked).toBe(true);

    // Verify issue creation call
    const issueCall = mockFetch.mock.calls[0];
    expect(issueCall[0]).toContain("/issues");
    const issueBody = JSON.parse(issueCall[1].body);
    expect(issueBody.title).toBe("Bug no dashboard");
    expect(issueBody.labels).toEqual(["bug"]);
    expect(issueBody.body).toContain("O gráfico não carrega");
    expect(issueBody.body).toContain("/dashboard");
    expect(issueBody.body).toContain("Mozilla/5.0");
  });

  it("returns 401 when not authenticated", async () => {
    (getAuthenticatedUserId as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Unauthorized")
    );

    const formData = createFormData({
      title: "Bug",
      description: "Descrição",
    });

    const response = await POST(createRequest(formData));
    expect(response.status).toBe(401);
  });

  it("returns 400 when title is missing", async () => {
    const formData = createFormData({
      title: "",
      description: "Descrição",
    });

    const response = await POST(createRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("obrigatórios");
  });

  it("returns 400 when description is missing", async () => {
    const formData = createFormData({
      title: "Bug",
      description: "",
    });

    const response = await POST(createRequest(formData));
    expect(response.status).toBe(400);
  });

  it("returns 400 when image exceeds 5MB", async () => {
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB

    const formData = createFormData(
      { title: "Bug", description: "Descrição" },
      [{ name: "large.png", content: largeBuffer, type: "image/png" }]
    );

    const response = await POST(createRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("5MB");
  });

  it("returns 400 for unsupported image type", async () => {
    const formData = createFormData(
      { title: "Bug", description: "Descrição" },
      [{ name: "doc.pdf", content: Buffer.from("fake"), type: "application/pdf" }]
    );

    const response = await POST(createRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("não suportado");
  });

  it("uploads images and embeds URLs in issue body", async () => {
    // Mock image upload
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        content: { download_url: "https://raw.githubusercontent.com/test/image.png" },
      }),
    });

    // Mock issue creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        number: 43,
        html_url: "https://github.com/vverzellesi/expense-control/issues/43",
        node_id: "I_def456",
      }),
    });

    // Mock project query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: { user: { projectV2: { id: "PVT_123" } } },
      }),
    });

    // Mock add to project
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: { addProjectV2ItemById: { item: { id: "PVTI_456" } } },
      }),
    });

    const formData = createFormData(
      { title: "Bug com imagem", description: "Veja o screenshot" },
      [{ name: "screenshot.png", content: Buffer.from("fake-image"), type: "image/png" }]
    );

    const response = await POST(createRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.projectLinked).toBe(true);

    // Verify image upload was called
    const uploadCall = mockFetch.mock.calls[0];
    expect(uploadCall[0]).toContain("bug-attachments");

    // Verify issue body contains image markdown
    const issueCall = mockFetch.mock.calls[1];
    const issueBody = JSON.parse(issueCall[1].body);
    expect(issueBody.body).toContain("![anexo-1]");
    expect(issueBody.body).toContain("raw.githubusercontent.com");
  });

  it("succeeds even when project linking fails", async () => {
    // Mock issue creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        number: 44,
        html_url: "https://github.com/vverzellesi/expense-control/issues/44",
        node_id: "I_ghi789",
      }),
    });

    // Mock project query — fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: "Forbidden" }),
    });

    const formData = createFormData({
      title: "Bug",
      description: "Descrição do bug",
    });

    const response = await POST(createRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.projectLinked).toBe(false);
  });
});
