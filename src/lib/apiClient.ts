import { auth } from "./firebase";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000; // 1s, 2s, 4s

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiClient(url: string, options: RequestInit = {}) {
  const user = auth.currentUser;

  // Se houver usuário logado no SDK, pega o token dele (Google Auth, etc)
  // Caso contrário, tenta pegar o token salvo no localStorage (Login convencional)
  let idToken = null;
  if (user) {
    try {
      // forceRefresh=true garante que tokens expirados sejam renovados automaticamente
      idToken = await user.getIdToken(true);
    } catch (error) {
      console.error("Erro ao obter ID Token do Firebase SDK:", error);
    }
  } else if (typeof window !== "undefined") {
    idToken = localStorage.getItem("gax_auth_token");
  }

  // Injeta o token no header se encontrado
  const headers = {
    ...options.headers,
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };

  const requestOptions: RequestInit = { ...options, headers };

  // Tentativas com backoff exponencial para lidar com cold starts do Cloud Run
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, requestOptions);

      if (response.status === 401) {
        // Cenário de token expirado ou inválido: limpa localStorage e redireciona para login
        console.warn("Sessão expirada ou não autorizada. Redirecionando para login...");
        if (typeof window !== "undefined") {
          localStorage.removeItem("gax_auth_token");
          localStorage.removeItem("gax_user_name");
          localStorage.removeItem("gax_user_email");
          localStorage.removeItem("gax_user_id");
          window.location.href = "/login?expired=true";
        }
      }

      // Qualquer resposta HTTP (mesmo erro 5xx) não precisa de retry —
      // só retentamos em falhas de rede (TypeError lançado pelo fetch)
      return response;
    } catch (error) {
      // TypeError indica falha de rede/conexão (servidor hibernado, sem internet, etc.)
      const isNetworkError = error instanceof TypeError;
      const isLastAttempt = attempt === MAX_RETRIES - 1;

      if (!isNetworkError || isLastAttempt) {
        throw error;
      }

      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `[apiClient] Falha de conexão (tentativa ${attempt + 1}/${MAX_RETRIES}). Aguardando ${delay}ms antes de tentar novamente...`,
        error
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
