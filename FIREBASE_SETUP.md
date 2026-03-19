# Configuração do Firebase - GAX 2.0

Para que o sistema funcione corretamente, tanto localmente quanto no Google Cloud Run, é necessário configurar as credenciais do Firebase.

## 1. Desenvolvimento Local

Para rodar o projeto no seu computador:
1. Coloque o arquivo `firebase-key.json` (baixado do Console do Firebase) na pasta raiz do projeto.
2. O arquivo já está no `.gitignore`, então ele **não** será enviado para o GitHub.

## 2. Google Cloud Run (Produção)

Como o arquivo de chave não é enviado para o GitHub, o sistema online precisa de outras formas de autenticação:

### Opção A: Variáveis de Ambiente (Simples)
No Console do Google Cloud, na configuração do seu serviço Cloud Run, adicione a seguinte variável:
- `FIREBASE_API_KEY`: Sua "Web API Key" (encontrada nas configurações do projeto no Firebase).

### Opção B: Permissões de Service Account (Recomendado)
A conta de serviço que roda o Cloud Run deve ter as seguintes permissões no projeto:
- `Cloud Datastore User` (ou `Firebase Firestore Admin`)
- `Storage Object Admin` (para o bucket de arquivos XML)

## 3. URLs de API

O Next.js está configurado para redirecionar as chamadas para o backend usando `localhost:8000`. Isso funciona dentro do Cloud Run porque ambos rodam no mesmo container.
