import { auth } from "./firebase";

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
  if (idToken) {
    options.headers = {
      ...options.headers,
      "Authorization": `Bearer ${idToken}`,
    };
  }

  const response = await fetch(url, options);
  
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

  return response;
}
