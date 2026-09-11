"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { request } from "@/lib/client";
import type { User } from "@/lib/types";
import Icon from "./Icon";

export default function Shell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const path = usePathname(),
    router = useRouter();
  const [error, setError] = useState("");
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Icon name="scan" size={25} />
          </span>
          <span>
            inwards<span className="brand-dot">.</span>
            <small>WAREHOUSE OPERATIONS</small>
          </span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <Link
            href="/"
            className={
              path !== "/help" && path !== "/admin"
                ? "nav-item active"
                : "nav-item"
            }
          >
            <Icon name="box" />
            Receiving
            <Icon name="arrow" size={16} />
          </Link>
          <Link
            href="/help"
            className={path === "/help" ? "nav-item active" : "nav-item"}
          >
            <Icon name="help" />
            Scanner guide
          </Link>
          {user.role === "ADMIN" && (
            <Link
              href="/admin"
              className={path === "/admin" ? "nav-item active" : "nav-item"}
            >
              <Icon name="box" />
              Admin
            </Link>
          )}
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" /> Built for the receiving floor
          <p>Scan. Review. Receive.</p>
        </div>
        <div className="user-block">
          <span className="avatar">
            {user.display_name.slice(0, 2).toUpperCase()}
          </span>
          <span>
            <strong>{user.display_name}</strong>
            <small>Warehouse team</small>
          </span>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={async () => {
              try {
                await request("/api/auth", {}, "DELETE");
                router.push("/login");
                router.refresh();
              } catch (error) {
                setError((error as Error).message);
              }
            }}
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
        {error && (
          <p role="alert" className="sidebar-error">
            {error}
          </p>
        )}
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span>
            Operations <span className="slash">/</span> <strong>Inwards</strong>
          </span>
          <span className="topbar-right">
            <span className="subtle-dot" /> Receiving workspace{" "}
            <span className="timezone">IST</span>
          </span>
        </header>
        <main id="main-content">{children}</main>
        <footer>
          INWARDS <span>Warehouse receiving, made straightforward.</span>
        </footer>
      </div>
    </div>
  );
}
