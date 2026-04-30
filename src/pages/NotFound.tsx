import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-6xl font-display font-bold text-primary">404</h1>
      <p className="text-muted-foreground">Страница не найдена</p>
      <Link to="/" className="btn-primary">На главную</Link>
    </div>
  )
}
