import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, sessionCookie } from "@/lib/auth";
import LoginForm from "./LoginForm";
import Icon from "@/components/Icon";

export default async function LoginPage() {
  if (await getSession((await cookies()).get(sessionCookie)?.value))
    redirect("/");
  return (
    <main className="login-page" id="main-content">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="scan" size={28} />
          </span>
          <span>
            inwards<span className="brand-dot">.</span>
          </span>
        </div>
        <div>
          <div className="eyebrow light">FROM DOCK TO DONE</div>
          <h1>
            Every scan.
            <br />
            Every piece.
            <br />
            <em>Accounted for.</em>
          </h1>
          <p>A clear, focused workspace for your warehouse receiving team.</p>
          <div className="login-steps">
            <span>01 &nbsp; SCAN</span>
            <span>02 &nbsp; REVIEW</span>
            <span>03 &nbsp; EXPORT</span>
          </div>
        </div>
        <small>WAREHOUSE OPERATIONS / INWARDS</small>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="eyebrow">YOUR RECEIVING WORKSPACE</div>
          <h2>Welcome back.</h2>
          <p className="muted">Sign in to start receiving stock.</p>
          <LoginForm />
          <p className="login-footnote">
            <Icon name="lock" size={15} /> Staff access only. Need an account?
            Contact your administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
