import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-semibold">
          Adam Woo
        </Link>
        <div className="flex gap-6 text-sm">
          <Link href="/projects">Projects</Link>
          <Link href="/about">About</Link>
        </div>
      </nav>
    </header>
  );
}
