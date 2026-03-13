import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// The setup.ts already mocks @/lib/auth-utils, so we import the mocked version
import { getAuthenticatedUserId } from "@/lib/auth-utils";

// Stub env before importing route
vi.stubEnv("GITHUB_TOKEN", "test-token");

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import route after mocks are set up
const { POST, rateLimitMap } = await import("@/app/api/bug-reports/route");

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

// Helper to mock a successful issue creation + project linking flow (no images)
function mockIssueAndProjectSuccess(issueNumber = 42) {
  // Mock issue creation
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({
      number: issueNumber,
      html_url: `https://github.com/vverzellesi/expense-control/issues/${issueNumber}`,
      node_id: `I_abc${issueNumber}`,
    }),
  });

  // Mock project query
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({
      data: { user: { projectV2: { id: "PVT_123" } } },
    }),
  });

  // Mock add to project mutation
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({
      data: { addProjectV2ItemById: { item: { id: "PVTI_123" } } },
    }),
  });
}

describe("/api/bug-reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMap.clear();
    (getAuthenticatedUserId as ReturnType<typeof vi.fn>).mockResolvedValue("user-1");
  });

  it("creates a GitHub issue successfully", async () => {
    mockIssueAndProjectSuccess();

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

  it("uploads images after issue creation and updates issue body", async () => {
    // 1. Mock issue creation (no images in body yet)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        number: 43,
        html_url: "https://github.com/vverzellesi/expense-control/issues/43",
        node_id: "I_def456",
      }),
    });

    // 2. Mock image upload
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        content: { download_url: "https://raw.githubusercontent.com/test/image.png" },
      }),
    });

    // 3. Mock issue PATCH (update body with image URLs)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    // 4. Mock project query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: { user: { projectV2: { id: "PVT_123" } } },
      }),
    });

    // 5. Mock add to project
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

    // Call order: issue creation, image upload, issue PATCH, project query, add to project
    expect(mockFetch).toHaveBeenCalledTimes(5);

    // 1st call: issue creation (without image URLs)
    const issueCall = mockFetch.mock.calls[0];
    expect(issueCall[0]).toContain("/issues");
    const issueBody = JSON.parse(issueCall[1].body);
    expect(issueBody.body).not.toContain("![anexo-1]");

    // 2nd call: image upload
    const uploadCall = mockFetch.mock.calls[1];
    expect(uploadCall[0]).toContain("bug-attachments");

    // 3rd call: PATCH issue with image URLs
    const patchCall = mockFetch.mock.calls[2];
    expect(patchCall[0]).toContain("/issues/43");
    expect(patchCall[1].method).toBe("PATCH");
    const patchBody = JSON.parse(patchCall[1].body);
    expect(patchBody.body).toContain("![anexo-1]");
    expect(patchBody.body).toContain("raw.githubusercontent.com");
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

  // === New tests for findings ===

  it("returns 429 when user exceeds rate limit", async () => {
    // Fill up the rate limit for user-1 (5 successful requests)
    for (let i = 0; i < 5; i++) {
      mockIssueAndProjectSuccess(50 + i);

      const formData = createFormData({
        title: `Bug ${i}`,
        description: `Descrição ${i}`,
      });
      await POST(createRequest(formData));
    }

    vi.clearAllMocks();

    // 6th request should be rate limited — no fetch calls
    const formData = createFormData({
      title: "Bug 6",
      description: "Descrição 6",
    });

    const response = await POST(createRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toContain("Muitos bug reports");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns projectLinked=false when GraphQL mutation returns 200 with errors", async () => {
    // Mock issue creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        number: 60,
        html_url: "https://github.com/vverzellesi/expense-control/issues/60",
        node_id: "I_graphql_err",
      }),
    });

    // Mock project query — succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: { user: { projectV2: { id: "PVT_123" } } },
      }),
    });

    // Mock add-to-project mutation — 200 OK but with GraphQL errors
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        errors: [{ message: "Could not resolve to a ProjectV2 with the number 2." }],
        data: null,
      }),
    });

    const formData = createFormData({
      title: "Bug GraphQL",
      description: "Testa erros GraphQL",
    });

    const response = await POST(createRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.projectLinked).toBe(false);
  });

  it("does not upload images if issue creation fails", async () => {
    // Mock issue creation — fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({ message: "Server error" }),
    });

    const formData = createFormData(
      { title: "Bug", description: "Descrição" },
      [{ name: "screenshot.png", content: Buffer.from("fake-image"), type: "image/png" }]
    );

    const response = await POST(createRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Erro ao enviar");

    // Only 1 fetch call (issue creation) — no image upload calls
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain("/issues");
  });

  it("returns projectLinked=false when project query returns GraphQL errors", async () => {
    // Mock issue creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        number: 61,
        html_url: "https://github.com/vverzellesi/expense-control/issues/61",
        node_id: "I_proj_err",
      }),
    });

    // Mock project query — 200 but with GraphQL errors
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        errors: [{ message: "Insufficient scopes" }],
        data: null,
      }),
    });

    const formData = createFormData({
      title: "Bug projeto",
      description: "Testa erro no fetch do projeto",
    });

    const response = await POST(createRequest(formData));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.projectLinked).toBe(false);
  });
});
