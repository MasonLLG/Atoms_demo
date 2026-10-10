import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center text-center">
      <div>
        <div className="text-5xl font-bold text-gradient">404</div>
        <p className="mt-3 text-sm text-muted">页面不存在，或应用已取消发布</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15">
          返回首页
        </Link>
      </div>
    </div>
  );
}
