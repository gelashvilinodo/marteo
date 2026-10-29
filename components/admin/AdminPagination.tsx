import Link from "next/link";

type AdminPaginationProps = { basePath: string; page: number; pageSize: number; total: number };

export default function AdminPagination({ basePath, page, pageSize, total }: AdminPaginationProps) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (pages <= 1) return null;
    const linkClass = "rounded-xl border border-border bg-surface px-4 py-2 text-sm text-text-primary hover:bg-background";
    return <nav aria-label="გვერდები" className="mt-4 flex items-center justify-between gap-3">
        {page > 1 ? <Link href={`${basePath}?page=${page - 1}`} prefetch={false} className={linkClass}>წინა</Link> : <span />}
        <span className="text-sm text-text-secondary">{page} / {pages}</span>
        {page < pages ? <Link href={`${basePath}?page=${page + 1}`} prefetch={false} className={linkClass}>შემდეგი</Link> : <span />}
    </nav>;
}
