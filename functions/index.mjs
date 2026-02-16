import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const githubToken = defineSecret("GITHUB_TRIGGER_TOKEN");
const githubOwner = defineSecret("GITHUB_OWNER");
const githubRepo = defineSecret("GITHUB_REPO");
const githubWorkflowId = defineSecret("GITHUB_WORKFLOW_ID");
const githubWorkflowRef = defineSecret("GITHUB_WORKFLOW_REF");
const endpointSecret = defineSecret("REFRESH_ENDPOINT_SECRET");

function json(response, status, body) {
  response.status(status).set("Content-Type", "application/json; charset=utf-8").send(JSON.stringify(body));
}

function getConfig() {
  return {
    token: githubToken.value(),
    owner: githubOwner.value(),
    repo: githubRepo.value(),
    workflowId: githubWorkflowId.value(),
    ref: githubWorkflowRef.value() || "main",
    endpointSecret: endpointSecret.value() || ""
  };
}

export const requestNekrologRefresh = onRequest(
  {
    cors: true,
    region: "europe-central2",
    secrets: [githubToken, githubOwner, githubRepo, githubWorkflowId, githubWorkflowRef, endpointSecret]
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.set("Allow", "POST");
      return json(response, 405, { ok: false, error: "method_not_allowed" });
    }

    const cfg = getConfig();
    if (cfg.endpointSecret) {
      const provided = String(request.get("x-refresh-secret") || "").trim();
      if (!provided || provided !== cfg.endpointSecret) {
        return json(response, 401, { ok: false, error: "unauthorized" });
      }
    }

    const runReason = String(request.body?.reason || "manual_ui").trim() || "manual_ui";

    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/actions/workflows/${encodeURIComponent(cfg.workflowId)}/dispatches`;
    const ghResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${cfg.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ref: cfg.ref,
        inputs: {
          reason: runReason,
          requested_from: "firebase_function"
        }
      })
    });

    if (!ghResponse.ok) {
      const ghText = await ghResponse.text();
      return json(response, 502, {
        ok: false,
        error: "github_dispatch_failed",
        status: ghResponse.status,
        details: ghText.slice(0, 400)
      });
    }

    return json(response, 202, {
      ok: true,
      status: "queued",
      workflow: cfg.workflowId,
      ref: cfg.ref,
      reason: runReason
    });
  }
);
