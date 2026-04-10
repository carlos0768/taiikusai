import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function Home() {
  const cookieStore = await cookies();
  const auth = cookieStore.get("taiikusai_auth");

  if (auth) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
