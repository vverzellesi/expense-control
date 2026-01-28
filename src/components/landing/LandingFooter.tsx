export function LandingFooter() {
  return (
    <footer className="border-t border-gray-100 bg-gray-50 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <p className="text-sm text-gray-600">
          © {new Date().getFullYear()} MyPocket. Todos os direitos reservados.
        </p>
        <div className="flex gap-6">
          <a
            href="#"
            className="text-sm text-gray-600 transition-colors hover:text-gray-900"
          >
            Privacidade
          </a>
          <a
            href="#"
            className="text-sm text-gray-600 transition-colors hover:text-gray-900"
          >
            Termos
          </a>
        </div>
      </div>
    </footer>
  )
}
