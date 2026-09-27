// Defaults to the page's own hostname (not a literal "localhost") so the
// API call stays same-site whether the dev server is opened as localhost
// or from a LAN IP (e.g. testing on a phone) — the backend's session
// cookie is SameSite=Lax, which the browser silently drops on cross-site
// requests, so a hardcoded host here would break login the moment the page
// is loaded from any other host. VITE_API_URL still overrides this when
// the API genuinely lives elsewhere (e.g. a deployed backend).
const API_URL = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:4000/api`;

interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, body: ApiErrorBody["error"]) {
    super(body.message);
    this.code = body.code;
    this.status = status;
    this.details = body.details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData must NOT get a manual Content-Type — the browser sets its own
  // multipart boundary when the body is a FormData instance.
  const isFormData = init?.body instanceof FormData;

  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
    ...init,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const errorBody: ApiErrorBody["error"] = body?.error ?? {
      code: "UNKNOWN_ERROR",
      message: "Something went wrong",
    };
    throw new ApiError(res.status, errorBody);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData }),
};
