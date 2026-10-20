# Spec Delta

## ADDED Requirements

### Requirement: 预缓存单项失败不阻断安装
系统 SHALL 在安装阶段逐条写入预缓存资源：单个资源写入失败时记录告警并继续，不影响其余资源被缓存，也不阻断 Service Worker 的安装与激活。

#### Scenario: 预缓存清单里有一条失效资源
- **WHEN** 预缓存清单中的某条资源在服务器上已不存在或返回错误
- **THEN** 其余资源仍被预缓存，Service Worker 正常安装并激活，离线时除该条外其余页面资源可用

#### Scenario: 预缓存清单全部有效
- **WHEN** 预缓存清单中的资源全部可以取到
- **THEN** 全部资源被预缓存，离线时页面完整可用
