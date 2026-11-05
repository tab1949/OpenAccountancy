import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthStatus } from "./AuthStatus";

export function LoginFlowPage({
  hasDatabase,
  onLoginSuccess
}: {
  hasDatabase: boolean;
  onLoginSuccess: () => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockedToday, setLockedToday] = useState(false);

  const handleLogin = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await window.openAccountancy.login({ userName, password });
      setRemainingAttempts(result.remainingAttempts);
      setMessage(result.message);
      setLockedToday(!result.ok && result.message.includes("已达上限"));
      if (result.ok) {
        setLockedToday(false);
        await onLoginSuccess();
        navigate("/app/home");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="panel auth-panel">
        <h1>{t("auth.login.title")}</h1>
        <p>{t("auth.login.description")}</p>
        <AuthStatus hasDatabase={hasDatabase} />

        <div className="form-grid">
          <label>
            {t("auth.username")}
            <input type="text" placeholder="请输入用户名" value={userName} onChange={(e) => setUserName(e.target.value)} />
          </label>
          <label>
            {t("auth.password")}
            <input
              type="password"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </div>

        <p className="auth-hint auth-hint-warning">
          今日最多尝试 5 次{remainingAttempts !== null ? `，当前剩余 ${remainingAttempts} 次` : ""}。
        </p>
        {lockedToday ? <p className="auth-hint auth-hint-warning">当前账号已锁定，次日将自动解锁后可重新登录。</p> : null}
        {message ? <p className="auth-hint">{message}</p> : null}

        <div className="auth-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || lockedToday || !userName.trim() || !password.trim()}
            onClick={() => void handleLogin()}
          >
            {loading ? "登录中..." : t("auth.login.cta")}
          </button>
          {hasDatabase ? <Link to="/auth/recover">{t("auth.recoverAccount")}</Link> : null}
          <Link to="/auth/init">{t("auth.initializeSystem")}</Link>
        </div>
      </section>
    </main>
  );
}
