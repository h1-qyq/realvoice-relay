# 一次性付费激活

## 价格与协议

- 价格：一次性 `USDC $0.01`；
- 人民币展示：约 `¥0.06`，仅作参考，不作为法币扣款承诺；
- 协议：x402 v2 `exact`；
- 回执：与 `agent_id` 绑定的永久 HMAC 回执；
- 私钥：买方在本地钱包签名，Skill 和卖方服务都不得接触买方私钥或助记词。

## 首次激活

1. 从安全配置读取 `REALVOICE_ACTIVATION_URL` 和稳定的 `agent_id`。
2. 计算 `agent_id` 的小写十六进制 SHA-256，作为 `Idempotency-Key`。
3. 调用 `POST /activate`。未付款时服务返回 HTTP 402，并声明必需的 x402 `Payment Identifier` 扩展。
4. 让兼容 x402 的 Agent 钱包把同一个 SHA-256 值写入 Payment Identifier 与 `Idempotency-Key`，在本地签名后重试。
5. 服务仅在结算成功后持久化永久授权；成功响应中的 `receipt` 存入 Agent 的秘密存储或权限受限文件。
6. 后续调用 `POST /verify` 或运行 `scripts/check_activation.py`，不得重复扣费。

### Agent 钱包对接

仓库已提供 `scripts/activate_with_wallet.mjs`，使用 x402 v2 官方客户端并由宿主 Agent 注入 EVM signer。安装运行时依赖后，宿主调用 `activateRealVoice({ endpoint, agentId, signer, expectedNetwork, expectedPayTo })`。客户端在签名前会同时校验精确金额 `10000` USDC 原子单位（$0.01）、网络和收款地址，并注入与 `agent_id` 绑定的 Payment Identifier。

该脚本只接收宿主钱包暴露的 signer 对象，不接收私钥、助记词或字符串形式的钱包凭据，也不会保存它们。`expectedPayTo` 必须来自发布者签名的部署配置，不得盲信 402 响应中的收款地址。

Payment Identifier、`Idempotency-Key` 与 `agent_id` 必须一致绑定。钱包重试同一激活请求时复用该标识，不得为每次网络重试生成新标识。

已激活查询只返回状态，不回传既有回执。回执不是公开恢复凭据；Agent 必须保存首次成功响应。若回执丢失，走部署者定义的身份核验恢复流程，不以再次付款作为默认补救。

不得把收款地址、生产签名密钥、CDP API Key 或买方钱包密钥写进 Skill。

## 状态处理

| 状态 | 行为 |
|---|---|
| `active` | 继续 Skill 工作流 |
| `receipt_missing` | 展示一次性价格和激活步骤 |
| `inactive` / `receipt_invalid` | 停止付费功能，允许重新验证 |
| `verification_unreachable` | 说明网络不可达，不称用户“未付款”，不自动重扣 |
| HTTP 402 | 交给兼容钱包完成付款；明确金额和网络 |
| `payment_identifier_mismatch` | 停止付款，重新计算标识，不用新的付款重试掩盖错误 |

## 服务端部署

仓库根目录的 `activation-gateway/` 是参考实现。它声明 Bazaar 发现元数据和 Payment Identifier，并在成功结算后写入授权。部署者必须设置收款地址和至少 32 字节随机激活密钥，并先在 Base Sepolia 测试。切换主网前按 Coinbase x402 官方卖方文档配置 CDP facilitator 和生产凭据。

