import LoginForm from "@/components/auth/LoginForm";
import { getSafeAuthRedirectPath } from "@/lib/authRedirect";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;
  const redirectTo = getSafeAuthRedirectPath(next);

  return (
    <main
      className="h-full flex items-center justify-center p-4 relative"
      style={{
        backgroundColor: "var(--background)",
        backgroundImage: "radial-gradient(circle, #333 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      <div className="bg-card border border-card-border rounded-xl shadow-2xl p-8 w-full max-w-sm">
        <LoginForm redirectTo={redirectTo} />
      </div>
    </main>
  );
}
