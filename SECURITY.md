# Security Policy / セキュリティポリシー

## 日本語

Remotie は Public リポジトリとして公開できるよう、秘密情報をコードに含めない方針です。

- `.env*` は Git 管理しません。
- `.env.example` にはプレースホルダーだけを置きます。
- LiveKit API key / secret、Basic Auth password、AWS credential は環境変数またはAWS側のSecret管理に置いてください。
- 誤って secret を commit した場合は、履歴削除だけでなく必ず credential をローテーションしてください。
- GitHub の secret scanning と push protection を有効化することを推奨します。

脆弱性や secret leak を見つけた場合は、公開Issueではなく、リポジトリ管理者へ非公開の経路で連絡してください。

## English

Remotie is intended to be safe to publish as an open repository by keeping secrets out of source control.

- `.env*` files are ignored by Git.
- `.env.example` contains placeholders only.
- Keep LiveKit API keys/secrets, Basic Auth passwords, and AWS credentials in environment variables or AWS-managed secret stores.
- If a secret is accidentally committed, rotate the credential even if the Git history is later rewritten.
- Enable GitHub secret scanning and push protection before making the repository public.

If you find a vulnerability or secret leak, please contact the repository owner privately rather than opening a public issue.
