import { NextResponse, type NextRequest } from 'next/server'
// Demo-grade admin gate: /admin/* (except /admin/login) requires the fd_admin cookie set by the admin login form.
// This is NOT production authentication (see README → Known limitations); it keeps the ops product separate from the customer product.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === '/admin/login') return NextResponse.next()
  if (req.cookies.get('fd_admin')?.value === '1') return NextResponse.next()
  const url = req.nextUrl.clone(); url.pathname = '/admin/login'; url.search = '?next=' + encodeURIComponent(pathname)
  return NextResponse.redirect(url)
}
export const config = { matcher: ['/admin/:path*'] }
