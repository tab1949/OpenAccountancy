import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { SecurityQuestionInput } from "@common/contracts";
import { AuthStatus } from "./AuthStatus";

export function InitWizardPage({ hasDatabase }: { hasDatabase: boolean }): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [dbStoragePath, setDbStoragePath] = useState("D:\\OpenAccountancyData\\");
  const [adminUserName, setAdminUserName] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [questions, setQuestions] = useState<SecurityQuestionInput[]>([
    { question: "您第一所学校的名称？", answer: "" },
    { question: "您母亲的姓名？", answer: "" },
    { question: "您最常用的备用手机号后四位？", answer: "" }
  ]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const updateQuestion = (index: number, patch: Partial<SecurityQuestionInput>): void => {
    setQuestions((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const handleInit = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await window.openAccountancy.initSystem({
        dbStoragePath,
        adminUserName,
        adminPassword,
        securityQuestions: questions
      });
      setMessage(result.message);
      if (result.ok) {
        navigate("/auth/login");
      }
    } finally {
      setLoading(false);
    }
  };

  const initDisabled =
    !dbStoragePath.trim() ||
    !adminUserName.trim() ||
    !adminPassword.trim() ||
    questions.some((q) => !q.question.trim() || !q.answer.trim());

  return (
    <main className="auth-shell">
      <section className="panel auth-panel auth-panel-wide">
        <h1>{t("auth.init.title")}</h1>
        <p>{t("auth.init.description")}</p>
        <AuthStatus hasDatabase={hasDatabase} />

        <ol className="auth-step-list">
          <li className="auth-step-item auth-step-item-active">1. 设置数据库路径</li>
          <li className="auth-step-item auth-step-item-active">2. 设置管理员账户</li>
          <li className="auth-step-item auth-step-item-active">3. 设置密保问题</li>
        </ol>

        <div className="form-grid">
          <label>
            数据库存储路径
            <input
              type="text"
              placeholder="例如：D:\\OpenAccountancyData\\"
              value={dbStoragePath}
              onChange={(e) => setDbStoragePath(e.target.value)}
            />
          </label>
          <label>
            管理员用户名
            <input type="text" placeholder="请输入管理员用户名" value={adminUserName} onChange={(e) => setAdminUserName(e.target.value)} />
          </label>
          <label>
            管理员密码
            <input type="password" placeholder="请输入管理员密码" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
          </label>
        </div>

        <div className="security-qa-grid">
          {questions.map((item, idx) => (
            <label key={`sec-q-${idx}`}>
              密保问题 {idx + 1}
              <input
                type="text"
                placeholder="请输入自定义问题"
                value={item.question}
                onChange={(e) => updateQuestion(idx, { question: e.target.value })}
              />
              <input
                type="text"
                placeholder="请输入答案"
                value={item.answer}
                onChange={(e) => updateQuestion(idx, { answer: e.target.value })}
              />
            </label>
          ))}
        </div>

        {message ? <p className="auth-hint">{message}</p> : null}

        <div className="auth-actions">
          <button type="button" className="btn btn-primary" disabled={loading || initDisabled} onClick={() => void handleInit()}>
            {loading ? "初始化中..." : t("auth.init.cta")}
          </button>
          <Link to="/auth/login">{t("common.login")}</Link>
        </div>
      </section>
    </main>
  );
}
