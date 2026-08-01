# RealVoice Relay · 真声直达

把用户想倾诉、抱怨或建议的话，转成真实、克制、可执行、可追踪的产品反馈，并送到经核实的官方入口。

`realvoice-relay` 既适合个人用户，也适合企业把大量真实反馈整理为可回溯的改进信号。它不会猜邮箱、虚构用户规模、泄露敏感信息或静默代发。

## 它会做什么

1. 找到并核实平台的官方反馈门户、应用内入口、工单或支持邮箱。
2. 把原话拆成用户亲历、已核实事实、待核实内容和模型推断。
3. 给出情绪强度与“满意倾向估计”，并标注置信度。
4. 提炼用户影响、平台价值、近期/下一版本/长期建议和验收标准。
5. 自动脱敏身份证、手机号、邮箱和支付信息。
6. 生成正式邮件或表单内容，加入真实用户来源声明。
7. 在用户看到最终目的地和正文并确认后，通过 Agent 邮箱或官方表单提交。
8. 保存 Message-ID、工单号或反馈链接，用于后续追踪。

## 安装

把 [`realvoice-relay`](./realvoice-relay) 文件夹复制到 Agent 的 Skill 目录，或安装本仓库生成的 `realvoice-relay-skill.zip`。

调用示例：

```text
Use $realvoice-relay to turn this complaint into a verified, actionable
feedback report and prepare it for the official channel: ...
```

第一次运行会检查一次性激活状态，然后询问 Agent 发件邮箱。

## Agent 邮箱：三步完成

1. 打开 [AgentMail](https://agentmail.to) 注册。
2. 创建独立邮箱，例如 `feedback-agent@agentmail.to`。
3. 在 Agent 中连接官方 MCP：`https://mcp.agentmail.to/mcp`。

API Key 应放入 Agent 运行时的秘密管理配置，不要粘贴到对话里。参考 [AgentMail sign-up](https://docs.agentmail.to/api-reference/agent/sign-up) 和 [MCP 文档](https://docs.agentmail.to/integrations/mcp)。

## 一次性付费激活

标准价格是一次性 `USDC $0.01`；`¥0.06` 只是近似展示值。付款使用面向 Agent 和 API 的 [x402 协议](https://docs.cdp.coinbase.com/x402/welcome)：

1. 部署 `activation-gateway/`；
2. 设置 EVM 收款地址和随机激活签名密钥；
3. 先在 Base Sepolia 测试；
4. 把网关地址配置为 `REALVOICE_ACTIVATION_URL`；
5. Agent 钱包把 `agent_id` 的 SHA-256 同时作为 `Idempotency-Key` 和 x402 Payment Identifier；
6. 钱包处理 HTTP 402 付款要求，成功后保存永久回执。

Skill 包含可执行的 x402 v2 买方客户端 `realvoice-relay/scripts/activate_with_wallet.mjs`。它由宿主 Agent 注入 signer，不接收或保存私钥；签名前会锁定 `$0.01`、网络和预期收款地址，并自动绑定 Payment Identifier。

```javascript
import { activateRealVoice } from "./realvoice-relay/scripts/activate_with_wallet.mjs";

const result = await activateRealVoice({
  endpoint: process.env.REALVOICE_ACTIVATION_URL,
  agentId: agent.id,
  signer: agent.wallet.evmSigner,
  expectedNetwork: process.env.REALVOICE_PAYMENT_NETWORK,
  expectedPayTo: process.env.REALVOICE_PAY_TO_ADDRESS,
});
agent.secrets.set("REALVOICE_ACTIVATION_RECEIPT", result.receipt);
```

先在 Skill 目录运行 `npm ci`安装锁定依赖。`expectedPayTo` 必须由发布者的可信配置提供，不能仅从待付款响应中读取。

```powershell
Set-Location activation-gateway
Copy-Item .env.example .env
# 通过部署平台的秘密管理设置 PAY_TO_ADDRESS 与 ACTIVATION_SECRET。
npm install
npm test
node --env-file=.env src/server.mjs
```

仓库没有内置收款地址或生产密钥。部署者必须自行配置 `PAY_TO_ADDRESS` 和至少 32 字节的 `ACTIVATION_SECRET`；未配置时服务会安全退出。主网部署请遵循 [x402 卖方快速开始](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers)。

网关使用 x402 v2 Bazaar 元数据声明 `POST /activate` 的输入、输出和价格。通过 CDP facilitator 完成首次成功结算后，端点可被 Bazaar 收录；永久授权只在结算成功后写入，失败或取消的付款不会生成服务器端激活记录。

## 安全边界

- 不接触或索取钱包私钥、助记词、邮箱密码。
- 不把搜索摘要或联系人聚合站当作官方来源。
- 不把单个用户意见扩大成群体共识。
- 不把情绪推断冒充调查结果。
- 不在用户看到最终版本并确认前发送。
- 不在发送结果未知时自动重试，避免重复提交。
- 不承诺平台一定回复、采纳或整改。

## 企业模式

企业场景按主题聚类、去重、脱敏并保留 `feedback_id`。安全、隐私、账单、未成年人和大面积故障进入专用升级渠道，其余形成日/周摘要；每条结论都可回溯到客户控制系统中的原始反馈。

示例：

- [个人反馈邮件](./docs/examples/personal-feedback.md)
- [企业反馈摘要](./docs/examples/enterprise-digest.md)

## 验证

```powershell
python -X utf8 C:\Users\22730\.codex\skills\.system\skill-creator\scripts\quick_validate.py realvoice-relay
python -m unittest discover -s tests -v
npm --prefix activation-gateway test
node --test tests/activation-client.test.mjs
```

仓库附带 GitHub Actions，在 Linux 和 Windows 上运行 Python、Node.js 与依赖安全检查。

## 发布到 GitHub

仓库名称建议使用 `realvoice-relay`。在已登录 GitHub CLI 的环境中可直接执行：

```powershell
gh repo create realvoice-relay --public --source . --remote origin --push
```

若仓库已经存在，则设置其 HTTPS 或 SSH remote 后运行 `git push -u origin main`。不要把 `.env`、收款签名密钥或钱包私钥提交到 GitHub。

推送 `v*` 标签后，`release.yml` 会重新运行测试、生成 `realvoice-relay-skill.zip` 与 `SHA256SUMS.txt`，并创建 GitHub Release：

```powershell
git tag v1.0.0
git push origin v1.0.0
```

## 目录

```text
realvoice-relay/          可安装 Skill
activation-gateway/      x402 一次付费激活网关
tools/                   确定性发布打包工具
tests/                   Python 合同和脚本测试
docs/examples/           个人与企业输出示例
docs/superpowers/        设计与实施记录
```

## 许可证

[MIT](./LICENSE)
