"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { request } from "@/lib/client";
import Icon from "@/components/Icon";

export default function LoginForm() {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="form-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(event.currentTarget);
        try {
          await request("/api/auth", {
            username: form.get("username"),
            password: form.get("password"),
          });
          router.push("/");
          router.refresh();
        } catch (error) {
          setError((error as Error).message);
          setBusy(false);
        }
      }}
    >
      <label>
        Username
        <input
          name="username"
          autoComplete="username"
          required
          autoFocus
          placeholder="Your username"
          maxLength={80}
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="Your password"
          maxLength={256}
        />
      </label>
      {error && (
        <div className="notice danger" role="alert">
          {error}
        </div>
      )}
      <button className="button primary full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
        <Icon name="arrow" size={18} />
      </button>
    </form>
  );
}
