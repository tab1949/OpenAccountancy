const zhCN = {
  common: {
    appName: "OpenAccountancy",
    home: "首页",
    module: "模块",
    version: "版本",
    help: "帮助",
    user: "用户",
    settings: "设置",
    logout: "退出",
    todo: "待办",
    initialization: "初始化",
    login: "登录",
    loading: "加载中...",
    unknownModule: "未知模块",
    routeNotRegistered: "该路由未在导航中注册。",
    notFound: "页面不存在",
    unknownAppRoute: "未知应用路由。"
  },
  auth: {
    username: "用户名",
    password: "密码",
    recoverAccount: "找回账户",
    initializeSystem: "初始化系统",
    login: {
      title: "登录",
      description: "检测到数据库后，使用用户名与密码登录。每日最多可尝试 5 次。",
      cta: "进入系统"
    },
    init: {
      title: "系统初始化",
      description: "首次使用请先设置数据库路径，并创建管理员账户与 3 个密保问题。",
      cta: "完成初始化"
    },
    recover: {
      title: "账户恢复",
      description: "根据密保问题找回账户并重置密码。",
      cta: "返回登录"
    },
    status: {
      dbDetected: "已检测到数据库文件",
      dbMissing: "未检测到数据库文件"
    }
  },
  home: {
    title: "欢迎使用 {{appName}}",
    description: "请先打开一个账套，或新建/导入账套。当前页面为依据需求文档搭建的应用框架。",
    openBookset: "打开账套",
    createBookset: "新建账套",
    importBookset: "导入账套",
    restoreBackup: "恢复备份",
    recentBooksets: "最近账套",
    noRecentBookset: "暂无最近账套。",
    quickStart: "快速开始",
    announcements: "系统状态/公告",
    releaseNotes: "版本更新说明",
    backupReminder: "数据备份提醒",
    moreOrSearch: "查看更多 / 搜索账套",
    footer: "版本号 · 检查更新 · 帮助中心 · 隐私政策",
    quickStartItems: {
      wizard: "账套新建向导",
      importHistory: "导入历史账套",
      voucherShortcuts: "从模板创建",
      commandSearch: "查看快捷键"
    }
  },
  shell: {
    noActiveBookset: "未打开账套",
    searchPlaceholder: "搜索命令、凭证号、摘要、科目...",
    booksetMenu: "账套",
    booksetMenuOpened: "账套：{{label}}",
    newBookset: "新建账套",
    openBookset: "打开账套",
    closeBookset: "关闭账套",
    switchBookset: "切换账套",
    exportBookset: "导出账套",
    importBookset: "导入账套",
    paramSettings: "参数设置",
    recentBooksetSearch: "最近账套",
    todoPanel: "待办",
    todoVoucherReview: "待审核凭证",
    todoVoucherPost: "待过账凭证",
    todoClosePeriod: "待结转损益/待结账",
    todoBankReconcile: "银行未对账",
    todoBackup: "备份提醒",
    todoSystemMsg: "系统消息",
    openMockBookset: "打开演示账套",
    closeBookset: "关闭账套",
    mockCompanyName: "示例有限公司"
  },
  placeholder: {
    frameworkReady: "框架已就绪",
    description:
      "该模块已根据需求文档完成脚手架搭建。业务逻辑、数据校验与流程编排将在下一阶段实现。"
  },
  nav: {
    section: {
      voucher: "凭证",
      ledger: "账簿",
      contacts: "往来",
      cashier: "出纳",
      periodEnd: "期末",
      reportForms: "报表",
      settings: "设置"
    },
    group: {
      voucherMain: "凭证业务",
      ledgerBooks: "账簿查询",
      contactsArAp: "应收应付与核销",
      cashierDaily: "出纳日常",
      periodEndProcess: "结转与结账",
      reportCore: "财务报表",
      settingsMasterData: "基础设置"
    },
    item: {
      voucherFill: "填制凭证",
      voucherQuery: "查询凭证",
      voucherReview: "审核凭证",
      voucherPost: "过账凭证",
      contactsAr: "应收管理",
      contactsAp: "应付管理",
      contactsWriteoff: "核销与对账",
      contactsAging: "账龄分析",
      cashierCashJournal: "现金日记账",
      cashierBankJournal: "银行存款日记账",
      cashierBankReconcile: "银行对账",
      cashierBalanceSheet: "余额调节表",
      bookkeepingRun: "记账",
      bookkeepingCarryCustom: "自定义结转",
      bookkeepingCarryCogs: "销售成本结转",
      bookkeepingCarryPl: "期间损益结转",
      ledgerGeneral: "科目总账",
      ledgerSubsidiary: "科目明细账",
      ledgerJournal: "科目日记账",
      ledgerTrialBalance: "科目余额表",
      reportGenerate: "报表生成",
      reportQuery: "报表查询",
      reportBalanceSheet: "资产负债表",
      reportIncome: "利润表",
      reportCashflow: "现金流量表",
      settingsBookset: "账套设置",
      settingsAccount: "账户安全",
      settingsSystem: "系统偏好"
    },
    desc: {
      voucherFill: "凭证填制工作台",
      voucherQuery: "凭证查询中心",
      voucherReview: "凭证审核队列",
      voucherPost: "凭证过账中心",
      contactsAr: "应收款管理与跟踪",
      contactsAp: "应付款管理与跟踪",
      contactsWriteoff: "往来核销与对账",
      contactsAging: "往来账龄统计与分析",
      cashierCashJournal: "现金日记账维护",
      cashierBankJournal: "银行存款日记账维护",
      cashierBankReconcile: "银行对账作业",
      cashierBalanceSheet: "余额调节表生成",
      bookkeepingRun: "常规记账操作",
      bookkeepingCarryCustom: "自定义结转流程",
      bookkeepingCarryCogs: "销售成本结转流程",
      bookkeepingCarryPl: "期间损益结转流程",
      ledgerGeneral: "科目总账视图",
      ledgerSubsidiary: "科目明细账视图",
      ledgerJournal: "科目日记账视图",
      ledgerTrialBalance: "科目余额表视图",
      reportGenerate: "报表生成中心",
      reportQuery: "已生成报表查询",
      reportBalanceSheet: "资产负债表模块",
      reportIncome: "利润表模块",
      reportCashflow: "现金流量表模块",
      settingsBookset: "账套参数配置",
      settingsAccount: "用户账户与安全",
      settingsSystem: "系统级偏好设置"
    }
  }
};

export default zhCN;
