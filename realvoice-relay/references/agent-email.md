# Agent 发件邮箱

默认推荐 AgentMail；它是面向 Agent 的 API-first 邮箱服务，提供独立收件箱、REST API、Webhook 和 MCP。

## 极简设置

1. 打开 <https://agentmail.to> 注册；也可使用官方 Agent sign-up 接口创建组织、收件箱和 API Key。
2. 创建独立邮箱，例如 `feedback-agent@agentmail.to`，完成所有者邮箱验证码验证。
3. 在 Agent 运行时连接官方 MCP：`https://mcp.agentmail.to/mcp`，把 API Key 存入运行时的秘密管理配置。

官方文档：

- Sign-up：<https://docs.agentmail.to/api-reference/agent/sign-up>
- MCP：<https://docs.agentmail.to/integrations/mcp>
- API Key：<https://docs.agentmail.to/knowledge-base/getting-api-key>

## 对话边界

- 只询问“你的 Agent 发件邮箱是什么？”或“是否需要三步设置？”
- 不要求用户在对话中发送 API Key、密码、验证码或恢复短语。
- 连接成功后先创建草稿或执行只读连通性检查。
- 真正发送仍遵守 Skill 的发送前确认卡。
- 记录 Message-ID 和线程 ID，方便跟进回复。

若用户选择其他邮箱服务，使用其官方连接方式；不要要求开启弱安全设置，也不要让 Agent 共用用户的主邮箱密码。

