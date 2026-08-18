interface ComingSoonPageProps {
  title: string;
  description: string;
  stage: string;
}

export default function ComingSoonPage({
  title,
  description,
  stage,
}: ComingSoonPageProps) {
  return (
    <main className="panel-page">
      <header className="panel-header">
        <div>
          <p className="auth-eyebrow">{stage}</p>
          <h1>{title}</h1>
          <p className="auth-muted">{description}</p>
        </div>
      </header>
      <section className="empty-state">
        <span>✦</span>
        <h2>Em preparação</h2>
        <p>
          Esta área será ativada na próxima etapa sem alterar o que já está
          funcionando.
        </p>
      </section>
    </main>
  );
}
