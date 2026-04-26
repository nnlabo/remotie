import { NextResponse, type NextRequest } from "next/server";

const REALM = "Remotie";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`
    }
  });
}

function isAuthorized(request: NextRequest) {
  const expectedUser = process.env.REMOTIE_BASIC_USER;
  const expectedPassword = process.env.REMOTIE_BASIC_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return true;
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return false;
  }

  const decoded = atob(header.slice("Basic ".length));
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) {
    return false;
  }

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  return user === expectedUser && password === expectedPassword;
}

export function middleware(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js).*)"]
};
