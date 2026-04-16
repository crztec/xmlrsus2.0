import { auth } from "./firebase";

export async function apiClient(url: string, options: RequestInit = {}) {
  const user = auth.currentUser;
  
  // Se houver usuário logado, tenta pegar o Token e injetar no header
  if (user) {
    try {
      const idToken = await user.getIdToken();
      options.headers = {
        ...options.headers,
        "Authorization": `Bearer ${idToken}`,
      };
    } catch (error) {
      console.error("Erro ao obter ID Token do Firebase:", error);
    }
  }

  const response = await fetch(url, options);
  
  if (response.status === 401) {
    // Cenário de token expirado ou inválido: redireciona para login se necessário
    console.warn("Sessão expirada ou não autorizada.");
  }

  return response;
}
