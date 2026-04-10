import LoginForm from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="h-full flex items-center justify-center p-4">
      <LoginForm />
    </main>
  );
}
