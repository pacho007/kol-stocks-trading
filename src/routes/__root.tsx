import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { MarketProvider } from "@/lib/market-store";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="num text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Ticker not listed</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This market doesn't exist, was delisted, or you fat-fingered the URL.
        </p>
        <div className="mt-6">
          <Link
            to="/market"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-bold tracking-widest uppercase text-primary-foreground transition-colors hover:brightness-110"
          >
            Back to market
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Feed disconnected</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. Try refreshing or head back to the market.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-bold tracking-widest uppercase text-primary-foreground"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-xs font-bold tracking-widest uppercase text-foreground hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SHARPS · Invest in Crypto Traders Like Stocks" },
      {
        name: "description",
        content:
          "SHARPS turns on-chain crypto traders into tradable stocks. Their performance is their share price.",
      },
      { property: "og:title", content: "SHARPS · Invest in Crypto Traders Like Stocks" },
      {
        property: "og:description",
        content: "Their on-chain performance is their share price.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=Sora:wght@400;600;700;800&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <MarketProvider>
        <div className="relative flex min-h-screen flex-col">
          <div
            aria-hidden
            className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[32rem] bg-[radial-gradient(60rem_22rem_at_50%_-8rem,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%)]"
          />
          <div className="relative z-50">
            <SiteHeader />
          </div>
          <main className="relative z-10 flex-1">
            <Outlet />
          </main>


          <SiteFooter />
        </div>
        <Toaster position="bottom-right" />
      </MarketProvider>
    </QueryClientProvider>
  );
}
