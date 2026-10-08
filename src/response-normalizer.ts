export type CodeArtifact = {
  type: "code";
  language: string;
  content: string;
};

export type NormalizedResponse = {
  raw: string;
  text: string;
  artifacts: CodeArtifact[];
};

const codeFencePattern = /```([a-zA-Z0-9_+#.-]*)\n([\s\S]*?)```/g;

export function normalizeResponse(raw: string): NormalizedResponse {
  const artifacts: CodeArtifact[] = [];
  for (const match of raw.matchAll(codeFencePattern)) {
    artifacts.push({
      type: "code",
      language: match[1] || "text",
      content: match[2]?.trimEnd() ?? ""
    });
  }

  return {
    raw,
    text: raw.replace(codeFencePattern, (_match, _language: string, content: string) => content.trim()),
    artifacts
  };
}