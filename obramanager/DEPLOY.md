# 🚀 DEPLOY.md — Guia Completo de Publicação
## ObraManager: Firebase + Vercel

Siga os passos abaixo para ter seu sistema rodando online em ~15 minutos.
Tudo é **100% gratuito** para uso em uma obra.

---

## PARTE 1 — Configurar o Firebase (Banco de Dados)

### 1.1 Criar projeto no Firebase

1. Acesse: https://console.firebase.google.com
2. Clique em **"Adicionar projeto"**
3. Nome do projeto: `obramanager-suaempresa` (sem espaços)
4. Desmarque o Google Analytics (não precisa) → **Criar projeto**
5. Aguarde ~30 segundos → **Continuar**

---

### 1.2 Criar o Banco de Dados Realtime

1. No menu esquerdo, clique em **"Realtime Database"**
2. Clique em **"Criar banco de dados"**
3. Escolha a região: **United States (us-central1)**
4. Em "Regras de segurança": selecione **"Iniciar no modo de teste"**
   ⚠️ *Isso permite acesso público por 30 dias. Depois configuraremos regras.*
5. Clique em **Ativar**

---

### 1.3 Obter o firebaseConfig

1. Clique na **engrenagem ⚙️** (topo esquerdo) → **Configurações do projeto**
2. Role até **"Seus aplicativos"** → Clique em **"</>"** (Web)
3. Apelido: `obramanager` → **Registrar app**
4. Você verá um bloco como este:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXX",
  authDomain: "seu-projeto.firebaseapp.com",
  databaseURL: "https://seu-projeto-default-rtdb.firebaseio.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

5. **Copie apenas o objeto `{}` interno** (sem `const firebaseConfig =`)

---

### 1.4 Regras de segurança (recomendado)

Após configurar, vá em **Realtime Database → Regras** e cole:

```json
{
  "rules": {
    "obramanager": {
      ".read": true,
      ".write": true
    }
  }
}
```

> Para maior segurança futura, implemente autenticação Firebase.
> Entre em contato para instruções de login com email/senha.

---

## PARTE 2 — Publicar no Vercel

### 2.1 Criar conta e fazer upload

1. Acesse: https://vercel.com → **Sign Up** com sua conta Google
2. Clique em **"Add New Project"**
3. Selecione **"Browse"** e faça upload da **pasta `obramanager`** inteira
   *(zip os 3 arquivos: index.html, css/style.css, js/app.js)*

### 2.2 Alternativa mais simples: arraste a pasta

1. Vá em https://vercel.com/new
2. Escolha **"Deploy from folder"**
3. Arraste a pasta `obramanager`
4. Clique em **Deploy**

### 2.3 Obter o link

Após ~1 minuto, você receberá um link como:
```
https://obramanager-seuusuario.vercel.app
```

**Compartilhe esse link com toda a equipe!** Funciona em celular, tablet e computador.

---

## PARTE 3 — Conectar o Firebase ao sistema

1. Acesse seu link do Vercel
2. Clique no banner amarelo no topo: **"Clique aqui para configurar"**
3. Cole o firebaseConfig copiado no passo 1.4
4. Clique em **"Conectar Firebase"**

✅ Pronto! Agora todos que acessarem o link verão os mesmos dados em tempo real.

---

## 🔄 Como atualizar o sistema no futuro

Quando houver novas versões do ObraManager:
1. Substitua os arquivos na sua pasta local
2. Vá em https://vercel.com → seu projeto → **"Redeploy"**
3. Os dados no Firebase não são afetados

---

## 📱 Dicas de uso

- **Celular**: Abra o link no Chrome → Menu → "Adicionar à tela inicial"
  O sistema funciona como um app instalado.

- **Múltiplas obras**: Futuramente podemos adicionar seleção de obra.
  Por ora, use um projeto Firebase por obra.

- **Backup dos dados**: No Firebase Console → Realtime Database → 
  clique nos **3 pontinhos** → **"Exportar JSON"**

---

## ❓ Suporte

Em caso de dúvidas, compartilhe este arquivo e o erro encontrado
para que o sistema seja atualizado conforme necessário.
