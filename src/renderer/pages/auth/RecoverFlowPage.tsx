import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { SecurityQuestionView } from "@common/contracts";
import { AuthStatus } from "./AuthStatus";

export function RecoverFlowPage({ hasDatabase }: { hasDatabase: boolean }): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<SecurityQuestionView[]>([]);
  const [answers, setAnswers] = useState(["", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasDatabase) {
      return;
    }

    void window.openAccountancy.getRecoverSecurityQuestions().then(setQuestions);
  }, [hasDatabase]);

  const handleRecover = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await window.openAccountancy.recoverAccount({ answers, newPassword });
      setMessage(result.ok ? `已重置账户：${result.userName ?? ""}` : result.message);
      if (result.ok) {
        navigate("/auth/login");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="panel auth-panel auth-panel-wide">
        <h1>{t("auth.recover.title")}</h1>
        <p>{t("auth.recover.description")}</p>
        <AuthStatus hasDatabase={hasDatabase} />

        {!hasDatabase ? (
          <p className="auth-hint auth-hint-warning">当前未检测到数据库文件，无法执行账户找回。</p>
        ) : (
          <>
            <div className="form-grid">
              {(questions.length > 0 ? questions : [{ ordinal: 1, question: "密保问题" }, { ordinal: 2, question: "密保问题" }, { ordinal: 3, question: "密保问题" }]).map(
                (item, idx) => (
                  <label key={`recover-q-${item.ordinal}`}>
                    密保问题 {item.ordinal}：{item.question}
                    <input
                      type="text"
                      placeholder="请输入答案"
                      value={answers[idx] ?? ""}
                      onChange={(e) => {
                        const next = [...answers];
                        next[idx] = e.target.value;
                        setAnswers(next);
                      }}
                    />
                  </label>
                )
              )}
              <label>
                设置新密码
                <input type="password" placeholder="请输入新密码" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </label>
            </div>
            <p className="auth-hint">密保答案与密码将以 SHA512 形式存储。</p>
          </>
        )}

        {message ? <p className="auth-hint">{message}</p> : null}

        <div className="auth-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || answers.some((a) => !a.trim()) || !newPassword.trim()}
            onClick={() => void handleRecover()}
          >
            {loading ? "处理中..." : t("auth.recover.cta")}
          </button>
          <Link to="/auth/init">{t("auth.initializeSystem")}</Link>
        </div>
      </section>
    </main>
  );
}
