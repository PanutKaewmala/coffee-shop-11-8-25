type PublicFetchOptions = Omit<RequestInit, "signal"> & {
  timeoutMs?: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getErrorMessage(data: unknown): string {
  if (isRecord(data) && typeof data.error === "string" && data.error.trim()) {
    return data.error.trim();
  }

  return "โหลดข้อมูลไม่สำเร็จ";
}

export async function fetchJsonWithTimeout(
  url: string,
  options: PublicFetchOptions = {}
): Promise<unknown> {
  const { timeoutMs = 8000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      throw new Error(getErrorMessage(data));
    }

    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("ใช้เวลานานเกินไป");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
