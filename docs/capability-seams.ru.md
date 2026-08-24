<!-- Создано скриптом scripts/gen-doc-graphs.ts — не редактируйте вручную.
     Выполните `pnpm run gen-doc-graphs`, чтобы сгенерировать заново. -->

# Capability Seams и основные сервисы

Сервис может быть сервисом ключевого стержня, заменяемым capability seam или точкой бандлов/композиции. Граф показывает пакет-владелец объявления сервиса, известные пакеты-реализации и пакеты, использующие сервис напрямую.

```mermaid
flowchart LR
  pkg_attachment["attachment"]
  svc_attachments["ctx.attachments<br/>Durable binary attachment storage"]
  pkg_attachment_local["attachment-local"]
  pkg_host_runtime["host-runtime"]
  pkg_llm_pi_ai["llm-pi-ai"]
  pkg_llm["llm"]
  svc_llm["ctx.llm<br/>LLM adapter registry"]
  pkg_llm_deepseek["llm-deepseek"]
  pkg_llm_replay["llm-replay"]
  pkg_agent_loop["agent-loop"]
  pkg_compaction_basic["compaction-basic"]
  pkg_token_meter["token-meter"]
  svc_tokenMeter["ctx.tokenMeter<br/>Replay token measurement"]
  pkg_compaction_tool_result_pruner["compaction-tool-result-pruner"]
  svc_toolResultPruner["ctx.toolResultPruner<br/>Model-free tool-result pruning"]
  pkg_session["session"]
  svc_sessions["ctx.sessions<br/>In-memory session store"]
  pkg_agent["agent"]
  pkg_session_persistence["session-persistence"]
  pkg_session_query["session-query"]
  pkg_session_query_sqlite["session-query-sqlite"]
  pkg_subagent_inprocess["subagent-inprocess"]
  pkg_invariants["invariants"]
  pkg_message_feedback["message-feedback"]
  svc_invariants["ctx.invariants<br/>Package-owned invariant registry"]
  pkg_scope["scope"]
  pkg_typert_registry["typert-registry"]
  svc_typert["ctx.typert<br/>Runtime type registry"]
  pkg_typert_loader["typert-loader"]
  pkg_api_gateway["api-gateway"]
  svc_typertGateway["ctx.typertGateway<br/>Typert Host invocation gateway"]
  svc_sessionPersistence["ctx.sessionPersistence<br/>Durable session persistence seam"]
  pkg_session_persistence_jsonl["session-persistence-jsonl"]
  pkg_session_persistence_sqlite["session-persistence-sqlite"]
  pkg_tool_bash["tool-bash"]
  pkg_hooks_claude_code["hooks-claude-code"]
  pkg_hooks_codex["hooks-codex"]
  pkg_settings["settings"]
  svc_settings["ctx.settings<br/>User-settings seam"]
  pkg_settings_file["settings-file"]
  pkg_apiproxy["apiproxy"]
  pkg_credentials["credentials"]
  svc_credentials["ctx.credentials<br/>Credential seam"]
  pkg_credentials_local["credentials-local"]
  pkg_authorization["authorization"]
  svc_authorization["ctx.authorization<br/>Authorization flow registry"]
  pkg_session_telemetry["session-telemetry"]
  svc_sessionTelemetry["ctx.sessionTelemetry<br/>Session telemetry seam"]
  pkg_session_telemetry_otel["session-telemetry-otel"]
  pkg_storage["storage"]
  svc_storage["ctx.storage<br/>Non-session storage hub"]
  pkg_storage_json["storage-json"]
  pkg_storage_sqlite["storage-sqlite"]
  pkg_storage_domain["storage-domain"]
  svc_storageDomain["ctx.storageDomain<br/>Domain data facility"]
  pkg_workspace["workspace"]
  svc_messageFeedback["ctx.messageFeedback<br/>Lifecycle-bound message feedback"]
  svc_workspaceRegistry["ctx.workspaceRegistry<br/>Workspace entity registry"]
  svc_sessionQuery["ctx.sessionQuery<br/>Session reads, traces, filters, and search"]
  pkg_session_reference["session-reference"]
  pkg_tool_session_query["tool-session-query"]
  pkg_file_reference["file-reference"]
  svc_fileReferences["ctx.fileReferences<br/>File reference discovery"]
  pkg_file_reference_local["file-reference-local"]
  svc_sessionReferenceResolver["ctx.sessionReferenceResolver<br/>Cross-session snapshot preparation"]
  pkg_session_title["session-title"]
  svc_sessionTitle["ctx.sessionTitle<br/>Log-backed session titles"]
  pkg_session_title_first_prompt_llm["session-title-first-prompt-llm"]
  pkg_session_title_all_prompts_llm["session-title-all-prompts-llm"]
  pkg_system_prompt["system-prompt"]
  svc_systemPrompt["ctx.systemPrompt<br/>System prompt assembly registry"]
  pkg_tools["tools"]
  pkg_tool_fs["tool-fs"]
  pkg_tool_terminal["tool-terminal"]
  pkg_tool_web["tool-web"]
  svc_tools["ctx.tools<br/>Tool registry and guarded execution pipeline"]
  pkg_tool_ask_user["tool-ask-user"]
  pkg_tool_cordis["tool-cordis"]
  pkg_tool_skill["tool-skill"]
  pkg_tool_subagent["tool-subagent"]
  pkg_tool_todo["tool-todo"]
  pkg_user_questions["user-questions"]
  svc_userQuestions["ctx.userQuestions<br/>Human question/answer seam"]
  pkg_plan_mode["plan-mode"]
  svc_planMode["ctx.planMode<br/>Plan collaboration state"]
  pkg_agent_presets["agent-presets"]
  svc_agentPresets["ctx.agentPresets<br/>Per-session agent composition"]
  pkg_commands["commands"]
  svc_commands["ctx.commands<br/>Human command registry"]
  pkg_session_projection["session-projection"]
  svc_sessionProjections["ctx.sessionProjections<br/>Session projection units"]
  pkg_host_apiproxy["host-apiproxy"]
  pkg_session_projection_cache["session-projection-cache"]
  svc_sessionProjectionCache["ctx.sessionProjectionCache<br/>Persisted projection cache"]
  pkg_skill["skill"]
  svc_skills["ctx.skills<br/>Skill provider registry"]
  pkg_skill_badge["skill-badge"]
  pkg_skill_filesystem["skill-filesystem"]
  svc_agents["ctx.agents<br/>Agent service"]
  pkg_acp["acp"]
  pkg_agent_default_model["agent-default-model"]
  svc_agentDefaultModel["ctx.agentDefaultModel<br/>Default Agent model selection"]
  pkg_headless["headless"]
  svc_agentLoop["ctx.agentLoop<br/>Concrete loop driver"]
  pkg_agent_spine_demo["agent-spine-demo"]
  pkg_goal["goal"]
  svc_goals["ctx.goals<br/>Same-session goal domain"]
  pkg_e2b["e2b"]
  svc_e2b["ctx.e2b<br/>E2B sandbox lifecycle owner"]
  pkg_fs_e2b["fs-e2b"]
  pkg_subprocess_e2b["subprocess-e2b"]
  pkg_subprocess["subprocess"]
  svc_subprocess["ctx.subprocess<br/>Subprocess seam"]
  pkg_subprocess_local["subprocess-local"]
  pkg_bash_local["bash-local"]
  pkg_bash_sandbox["bash-sandbox"]
  pkg_terminal_bash["terminal-bash"]
  pkg_lsp_stdio["lsp-stdio"]
  pkg_subagent_acp["subagent-acp"]
  pkg_subagent_codex["subagent-codex"]
  pkg_subagent_claude_code["subagent-claude-code"]
  pkg_shell["shell"]
  svc_shell["ctx.shell<br/>Bash executor seam"]
  pkg_pwsh_local["pwsh-local"]
  pkg_tool_pwsh["tool-pwsh"]
  pkg_shell_env["shell-env"]
  svc_shellEnv["ctx.shellEnv<br/>Managed bash environment registry"]
  pkg_terminal["terminal"]
  svc_terminals["ctx.terminals<br/>Persistent PTY session registry"]
  pkg_sandbox["sandbox"]
  svc_sandbox["ctx.sandbox<br/>Process-sandbox seam"]
  pkg_sandbox_local["sandbox-local"]
  pkg_sandbox_policy["sandbox-policy"]
  svc_sandboxPolicy["ctx.sandboxPolicy<br/>Sandbox policy home"]
  pkg_fs_sandbox["fs-sandbox"]
  pkg_approval["approval"]
  svc_approval["ctx.approval<br/>Approval seam"]
  pkg_permission_presets["permission-presets"]
  svc_permissionPresets["ctx.permissionPresets<br/>Permission presets"]
  pkg_code_runtime["code-runtime"]
  svc_codeRuntime["ctx.codeRuntime<br/>Code-execution seam"]
  pkg_code_runtime_worker["code-runtime-worker"]
  pkg_fs["fs"]
  svc_fs["ctx.fs<br/>Filesystem provider seam"]
  pkg_fs_local["fs-local"]
  pkg_fs_observation_policy["fs-observation-policy"]
  pkg_compaction["compaction"]
  svc_compaction["ctx.compaction<br/>Compaction seam"]
  pkg_subagent["subagent"]
  svc_subagents["ctx.subagents<br/>Subagent provider and continuation service"]
  pkg_subagent_spawn_in_process["subagent-spawn-in-process"]
  pkg_subagent_fork_in_process["subagent-fork-in-process"]
  pkg_subagent_dsh_sdk["subagent-dsh-sdk"]
  pkg_tool_subagent_control["tool-subagent-control"]
  pkg_tool_ralph["tool-ralph"]
  pkg_agent_team["agent-team"]
  svc_agentTeams["ctx.agentTeams<br/>Agent Teams coordination domain"]
  pkg_tool_agent_team["tool-agent-team"]
  pkg_jobs["jobs"]
  svc_jobs["ctx.jobs<br/>Background job registry"]
  pkg_jobs_local["jobs-local"]
  pkg_tool_jobs["tool-jobs"]
  pkg_web["web"]
  svc_web["ctx.web<br/>Web access provider registry"]
  pkg_web_search_exa["web-search-exa"]
  pkg_web_search_perplexity["web-search-perplexity"]
  pkg_web_search_deepseek["web-search-deepseek"]
  pkg_web_fetch_http["web-fetch-http"]
  pkg_spill["spill"]
  svc_spillStore["ctx.spillStore<br/>Spill storage seam"]
  pkg_spill_local["spill-local"]
  pkg_spill_policy["spill-policy"]
  pkg_directory_picker["directory-picker"]
  svc_directoryPicker["ctx.directoryPicker<br/>Workspace-directory picking seam"]
  pkg_directory_picker_native["directory-picker-native"]
  pkg_directory_picker_browse["directory-picker-browse"]
  pkg_webserver["webserver"]
  svc_webServer["ctx.webServer<br/>HTTP route registration"]
  pkg_connection["connection"]
  pkg_modules["modules"]
  pkg_hmr["hmr"]
  svc_clientModules["ctx.clientModules<br/>Client plugin graph host"]
  pkg_workflow["workflow"]
  svc_workflowEngine["ctx.workflowEngine<br/>Workflow script engine"]
  pkg_workflow_worker_thread["workflow-worker-thread"]
  pkg_tool_workflow["tool-workflow"]
  pkg_lsp["lsp"]
  svc_lsp["ctx.lsp<br/>Language-server navigation seam"]
  pkg_lsp_local["lsp-local"]
  pkg_tool_lsp["tool-lsp"]
  svc_apiProxy["ctx.apiProxy<br/>Host API dispatch"]
  pkg_cordis_host_runner["cordis-host-runner"]
  svc_dynamicCordisRunner["ctx.dynamicCordisRunner<br/>Dynamic Cordis package host runner"]
  svc_cordisInspect["ctx.cordisInspect<br/>Dynamic Cordis inspect registry"]
  pkg_acp --> svc_approval
  pkg_agent --> svc_agents
  pkg_agent_default_model --> svc_agentDefaultModel
  pkg_agent_loop --> svc_agentLoop
  pkg_agent_presets --> svc_agentPresets
  pkg_agent_team --> svc_agentTeams
  pkg_api_gateway --> svc_typertGateway
  pkg_apiproxy --> svc_apiProxy
  pkg_approval --> svc_approval
  pkg_attachment --> svc_attachments
  pkg_attachment_local --> svc_attachments
  pkg_authorization --> svc_authorization
  pkg_bash_local --> svc_shell
  pkg_bash_sandbox --> svc_shell
  pkg_code_runtime --> svc_codeRuntime
  pkg_code_runtime_worker --> svc_codeRuntime
  pkg_commands --> svc_commands
  pkg_compaction --> svc_compaction
  pkg_compaction_basic --> svc_compaction
  pkg_compaction_tool_result_pruner --> svc_toolResultPruner
  pkg_cordis_host_runner --> svc_cordisInspect
  pkg_cordis_host_runner --> svc_dynamicCordisRunner
  pkg_credentials --> svc_credentials
  pkg_credentials_local --> svc_credentials
  pkg_directory_picker --> svc_directoryPicker
  pkg_directory_picker_browse --> svc_directoryPicker
  pkg_directory_picker_native --> svc_directoryPicker
  pkg_e2b --> svc_e2b
  pkg_file_reference --> svc_fileReferences
  pkg_file_reference_local --> svc_fileReferences
  pkg_fs --> svc_fs
  pkg_fs_e2b --> svc_fs
  pkg_fs_local --> svc_fs
  pkg_fs_sandbox --> svc_fs
  pkg_goal --> svc_goals
  pkg_invariants --> svc_invariants
  pkg_jobs --> svc_jobs
  pkg_jobs_local --> svc_jobs
  pkg_llm --> svc_llm
  pkg_llm_deepseek --> svc_llm
  pkg_llm_pi_ai --> svc_llm
  pkg_llm_replay --> svc_llm
  pkg_lsp --> svc_lsp
  pkg_lsp_local --> svc_lsp
  pkg_message_feedback --> svc_messageFeedback
  pkg_modules --> svc_clientModules
  pkg_permission_presets --> svc_permissionPresets
  pkg_plan_mode --> svc_planMode
  pkg_pwsh_local --> svc_shell
  pkg_sandbox --> svc_sandbox
  pkg_sandbox_local --> svc_sandbox
  pkg_sandbox_policy --> svc_sandboxPolicy
  pkg_session --> svc_sessions
  pkg_session_persistence --> svc_sessionPersistence
  pkg_session_persistence_jsonl --> svc_sessionPersistence
  pkg_session_persistence_sqlite --> svc_sessionPersistence
  pkg_session_projection --> svc_sessionProjections
  pkg_session_projection_cache --> svc_sessionProjectionCache
  pkg_session_query --> svc_sessionQuery
  pkg_session_query_sqlite --> svc_sessionQuery
  pkg_session_reference --> svc_sessionReferenceResolver
  pkg_session_telemetry --> svc_sessionTelemetry
  pkg_session_telemetry_otel --> svc_sessionTelemetry
  pkg_session_title --> svc_sessionTitle
  pkg_session_title_all_prompts_llm --> svc_sessionTitle
  pkg_session_title_first_prompt_llm --> svc_sessionTitle
  pkg_settings --> svc_settings
  pkg_settings_file --> svc_settings
  pkg_shell --> svc_shell
  pkg_shell_env --> svc_shellEnv
  pkg_skill --> svc_skills
  pkg_skill_badge --> svc_skills
  pkg_skill_filesystem --> svc_skills
  pkg_spill --> svc_spillStore
  pkg_spill_local --> svc_spillStore
  pkg_storage --> svc_storage
  pkg_storage_domain --> svc_storageDomain
  pkg_storage_json --> svc_storage
  pkg_storage_sqlite --> svc_storage
  pkg_subagent --> svc_subagents
  pkg_subagent_acp --> svc_subagents
  pkg_subagent_claude_code --> svc_subagents
  pkg_subagent_codex --> svc_subagents
  pkg_subagent_dsh_sdk --> svc_subagents
  pkg_subagent_fork_in_process --> svc_subagents
  pkg_subagent_spawn_in_process --> svc_subagents
  pkg_subprocess --> svc_subprocess
  pkg_subprocess_e2b --> svc_subprocess
  pkg_subprocess_local --> svc_subprocess
  pkg_system_prompt --> svc_systemPrompt
  pkg_terminal --> svc_terminals
  pkg_terminal_bash --> svc_terminals
  pkg_token_meter --> svc_tokenMeter
  pkg_tools --> svc_tools
  pkg_typert_registry --> svc_typert
  pkg_user_questions --> svc_userQuestions
  pkg_web --> svc_web
  pkg_web_fetch_http --> svc_web
  pkg_web_search_deepseek --> svc_web
  pkg_web_search_exa --> svc_web
  pkg_web_search_perplexity --> svc_web
  pkg_webserver --> svc_webServer
  pkg_workflow --> svc_workflowEngine
  pkg_workflow_worker_thread --> svc_workflowEngine
  pkg_workspace --> svc_workspaceRegistry
  svc_agentDefaultModel --> pkg_headless
  svc_agentDefaultModel --> pkg_host_apiproxy
  svc_agentLoop --> pkg_agent_spine_demo
  svc_agentTeams --> pkg_tool_agent_team
  svc_agents --> pkg_acp
  svc_agents --> pkg_agent_loop
  svc_agents --> pkg_subagent_inprocess
  svc_apiProxy --> pkg_connection
  svc_approval --> pkg_tool_bash
  svc_approval --> pkg_tools
  svc_attachments --> pkg_host_runtime
  svc_attachments --> pkg_llm_pi_ai
  svc_authorization --> pkg_llm_pi_ai
  svc_clientModules --> pkg_hmr
  svc_codeRuntime --> pkg_tools
  svc_compaction --> pkg_compaction_basic
  svc_cordisInspect --> pkg_tool_cordis
  svc_credentials --> pkg_apiproxy
  svc_credentials --> pkg_llm_deepseek
  svc_credentials --> pkg_llm_pi_ai
  svc_directoryPicker --> pkg_apiproxy
  svc_dynamicCordisRunner --> pkg_tool_cordis
  svc_e2b --> pkg_fs_e2b
  svc_e2b --> pkg_subprocess_e2b
  svc_fs --> pkg_tool_fs
  svc_invariants --> pkg_agent
  svc_invariants --> pkg_agent_loop
  svc_invariants --> pkg_scope
  svc_invariants --> pkg_session
  svc_jobs --> pkg_tool_bash
  svc_jobs --> pkg_tool_jobs
  svc_jobs --> pkg_tool_subagent
  svc_jobs --> pkg_tool_terminal
  svc_llm --> pkg_agent_loop
  svc_llm --> pkg_compaction_basic
  svc_lsp --> pkg_tool_lsp
  svc_sandbox --> pkg_bash_sandbox
  svc_sandbox --> pkg_terminal_bash
  svc_sandboxPolicy --> pkg_bash_sandbox
  svc_sandboxPolicy --> pkg_fs_sandbox
  svc_sandboxPolicy --> pkg_terminal_bash
  svc_sessionPersistence --> pkg_agent_loop
  svc_sessionPersistence --> pkg_hooks_claude_code
  svc_sessionPersistence --> pkg_hooks_codex
  svc_sessionPersistence --> pkg_message_feedback
  svc_sessionPersistence --> pkg_session_query
  svc_sessionPersistence --> pkg_session_query_sqlite
  svc_sessionPersistence --> pkg_tool_bash
  svc_sessionProjectionCache --> pkg_host_apiproxy
  svc_sessionProjections --> pkg_host_apiproxy
  svc_sessionProjections --> pkg_session_title
  svc_sessionProjections --> pkg_tool_todo
  svc_sessionQuery --> pkg_session_reference
  svc_sessionQuery --> pkg_tool_session_query
  svc_sessions --> pkg_agent
  svc_sessions --> pkg_agent_loop
  svc_sessions --> pkg_invariants
  svc_sessions --> pkg_message_feedback
  svc_sessions --> pkg_session_persistence
  svc_sessions --> pkg_session_query
  svc_sessions --> pkg_session_query_sqlite
  svc_sessions --> pkg_subagent_inprocess
  svc_settings --> pkg_apiproxy
  svc_settings --> pkg_llm_deepseek
  svc_settings --> pkg_llm_pi_ai
  svc_shell --> pkg_hooks_claude_code
  svc_shell --> pkg_hooks_codex
  svc_shell --> pkg_tool_bash
  svc_shell --> pkg_tool_pwsh
  svc_shellEnv --> pkg_tool_bash
  svc_shellEnv --> pkg_tool_pwsh
  svc_skills --> pkg_tool_skill
  svc_spillStore --> pkg_spill_policy
  svc_storage --> pkg_storage_domain
  svc_storageDomain --> pkg_message_feedback
  svc_storageDomain --> pkg_workspace
  svc_subagents --> pkg_tool_ralph
  svc_subagents --> pkg_tool_subagent
  svc_subagents --> pkg_tool_subagent_control
  svc_subprocess --> pkg_bash_local
  svc_subprocess --> pkg_bash_sandbox
  svc_subprocess --> pkg_lsp_stdio
  svc_subprocess --> pkg_subagent_acp
  svc_subprocess --> pkg_subagent_claude_code
  svc_subprocess --> pkg_subagent_codex
  svc_subprocess --> pkg_terminal_bash
  svc_systemPrompt --> pkg_agent_loop
  svc_systemPrompt --> pkg_tool_fs
  svc_systemPrompt --> pkg_tool_terminal
  svc_systemPrompt --> pkg_tool_web
  svc_systemPrompt --> pkg_tools
  svc_terminals --> pkg_tool_terminal
  svc_tokenMeter --> pkg_compaction_basic
  svc_toolResultPruner --> pkg_compaction_basic
  svc_tools --> pkg_agent_loop
  svc_tools --> pkg_tool_ask_user
  svc_tools --> pkg_tool_bash
  svc_tools --> pkg_tool_cordis
  svc_tools --> pkg_tool_fs
  svc_tools --> pkg_tool_skill
  svc_tools --> pkg_tool_subagent
  svc_tools --> pkg_tool_terminal
  svc_tools --> pkg_tool_todo
  svc_tools --> pkg_tool_web
  svc_typert --> pkg_api_gateway
  svc_typert --> pkg_typert_loader
  svc_userQuestions --> pkg_tool_ask_user
  svc_web --> pkg_tool_web
  svc_webServer --> pkg_connection
  svc_webServer --> pkg_hmr
  svc_webServer --> pkg_modules
  svc_workflowEngine --> pkg_tool_ralph
  svc_workflowEngine --> pkg_tool_workflow
  svc_workspaceRegistry --> pkg_apiproxy
  svc_fs -. event gate .-> pkg_fs_observation_policy
```

| Ключ ctx | Роль | Владелец | Реализации | Прямые потребители | Сопутствующие плагины | Примечание |
| --- | --- | --- | --- | --- | --- | --- |
| `ctx.attachments` | `seam` | [`attachment`](../packages/attachment/attachment) | [`attachment-local`](../packages/attachment/attachment-local) | `host-runtime`, [`llm-pi-ai`](../packages/llm/llm-pi-ai) | - | Хост фиксирует принятые изображения до событий сессии; адаптеры провайдеров превращают авторизованные долговечные ссылки в нативное для провайдера содержимое. |
| `ctx.llm` | `seam` | [`llm`](../packages/llm/llm) | [`llm-deepseek`](../packages/llm/llm-deepseek), [`llm-pi-ai`](../packages/llm/llm-pi-ai), [`llm-replay`](../packages/test-support/llm-replay) | [`agent-loop`](../packages/core/agent-loop), [`compaction-basic`](../packages/compaction/compaction-basic) | - | Адаптеры регистрируют реализации провайдеров; цикл и компакция вызывают независимый от провайдера потоковый сервис. |
| `ctx.tokenMeter` | `core` | [`token-meter`](../packages/llm/token-meter) | - | [`compaction-basic`](../packages/compaction/compaction-basic) | - | Владеет изолированными посессионными свёртками воспроизведения; потребители давления разделяют неизменяемые версионированные измерения. |
| `ctx.toolResultPruner` | `core` | [`compaction-tool-result-pruner`](../packages/compaction/compaction-tool-result-pruner) | - | [`compaction-basic`](../packages/compaction/compaction-basic) | - | Переписывает чрезмерно большие текущие результаты инструментов посредством воспроизводимых одноузловых замен поверхности до компакции сводки. |
| `ctx.sessions` | `core` | [`session`](../packages/core/session) | - | [`agent-loop`](../packages/core/agent-loop), [`agent`](../packages/core/agent), [`session-persistence`](../packages/session/session-persistence), [`session-query`](../packages/session-query/session-query), [`session-query-sqlite`](../packages/session-query/session-query-sqlite), `subagent-inprocess`, [`invariants`](../packages/runtime-diagnostics/invariants), [`message-feedback`](../packages/feedback/message-feedback) | - | Владеет append-only экземплярами Session и порождает долговечный поток событий сессии. |
| `ctx.invariants` | `core` | [`invariants`](../packages/runtime-diagnostics/invariants) | - | [`session`](../packages/core/session), [`agent`](../packages/core/agent), [`scope`](../packages/core/scope), [`agent-loop`](../packages/core/agent-loop) | - | Сопутствующие подпути регистрируют локальные для владельца проверки; сервис владеет выбором, уникальностью, дочерними fiber и сбоями с атрибуцией по пакету. |
| `ctx.typert` | `core` | [`typert-registry`](../packages/typert/registry) | - | [`typert-loader`](../packages/typert/loader), [`api-gateway`](../packages/api/gateway) | - | Плагины регистрируют живые zod-вклады напрямую или через dsh-typert-loader; API-шлюз использует дескрипторы вызовов и провайдеров, а прочие потребители рантайма запрашивают схемы и метаданные рефлексии на собственных границах. |
| `ctx.typertGateway` | `core` | [`api-gateway`](../packages/api/gateway) | - | - | - | Связывает сгенерированные Remote-дескрипторы с живыми Cordis-сервисами, разрешает зарегистрированные идентичности и открывает unary-вызовы через общий RPC-носитель Connection. |
| `ctx.sessionPersistence` | `seam` | [`session-persistence`](../packages/session/session-persistence) | [`session-persistence-jsonl`](../packages/session/session-persistence-jsonl), [`session-persistence-sqlite`](../packages/session/session-persistence-sqlite) | [`agent-loop`](../packages/core/agent-loop), [`tool-bash`](../packages/shell/tool-bash), [`hooks-claude-code`](../packages/hooks/hooks-claude-code), [`hooks-codex`](../packages/hooks/hooks-codex), [`session-query`](../packages/session-query/session-query), [`session-query-sqlite`](../packages/session-query/session-query-sqlite), [`message-feedback`](../packages/feedback/message-feedback) | - | Бэкенды персистируют один и тот же словарь SessionEvent; приложения выбирают бэкенд во время композиции. |
| `ctx.settings` | `seam` | [`settings`](../packages/settings/settings) | [`settings-file`](../packages/settings/settings-file) | [`llm-deepseek`](../packages/llm/llm-deepseek), [`llm-pi-ai`](../packages/llm/llm-pi-ai), `apiproxy` | - | Плагины регистрируют схемы пространств имён и разрешают послойные значения; провайдеры хранят исходный документ. LLM-адаптеры регистрируют свою конфигурацию входа как базу композиции в пользовательской секции; веб-шлюз отдаёт обезличенные послойные дескрипторы и пишет пользовательский слой. |
| `ctx.credentials` | `seam` | [`credentials`](../packages/credentials/credentials) | [`credentials-local`](../packages/credentials/credentials-local) | [`llm-deepseek`](../packages/llm/llm-deepseek), [`llm-pi-ai`](../packages/llm/llm-pi-ai), `apiproxy` | - | Конфигурация несёт ссылки на секреты; значениями владеют провайдеры. Потребители разрешают их при каждой операции, поэтому сменённые учётные данные попадают уже в следующий запрос; веб-шлюз открывает представления без значений и хранилище только для записи. |
| `ctx.authorization` | `seam` | [`authorization`](../packages/credentials/authorization) | - | [`llm-pi-ai`](../packages/llm/llm-pi-ai) | - | Потоки регистрируются плагином, знающим, как получить конкретные учётные данные, и ключуются записью, которую они создают; seam владеет диалогом и жизненным циклом «одна попытка на ключ», но никогда — протоколом. |
| `ctx.sessionTelemetry` | `seam` | [`session-telemetry`](../packages/session/session-telemetry) | [`session-telemetry-otel`](../packages/session/session-telemetry-otel) | - | - | Seam захватывает, обезличивает и передаёт записи сессии одному бэкенду; больше никто сервис не использует — его вывод покидает процесс. |
| `ctx.storage` | `seam` | [`storage`](../packages/storage/storage) | [`storage-json`](../packages/storage/storage-json), [`storage-sqlite`](../packages/storage/storage-sqlite) | [`storage-domain`](../packages/storage/storage-domain) | - | Бэкенды регистрируются бок о бок под именами; формы данных (сначала доменная) монтируются на хаб и переводят типизированные операции в непрозрачные примитивы KV-единиц. |
| `ctx.storageDomain` | `core` | [`storage-domain`](../packages/storage/storage-domain) | - | [`workspace`](../packages/workspace/workspace), [`message-feedback`](../packages/feedback/message-feedback) | - | Ожидает каждый настроенный бэкенд, затем публикует доменную форму как единый привязанный к жизненному циклу сервис для типизированного долговечного состояния. |
| `ctx.messageFeedback` | `core` | [`message-feedback`](../packages/feedback/message-feedback) | - | - | - | Владеет локальной обратной связью по каждому сообщению ассистента, проверками жизненного цикла и цели, compare-and-set по каждому элементу и контрактом unary Remote хоста, не входя в историю Session или телеметрию. |
| `ctx.workspaceRegistry` | `core` | [`workspace`](../packages/workspace/workspace) | - | `apiproxy` | - | Владеет брендированными WorkspaceId записями над доменным механизмом; стабильные учётные записи sessionIds лежат в основе Host RPC и проекций GUI. |
| `ctx.sessionQuery` | `seam` | [`session-query`](../packages/session-query/session-query) | [`session-query-sqlite`](../packages/session-query/session-query-sqlite) | [`session-reference`](../packages/context/session-reference), [`tool-session-query`](../packages/session-query/tool-session-query) | - | Интерфейс поставляет точные чтения, фильтры и трассировки; его конкретный бэкенд добавляет полнотекстовую сверку, ранжирование, сниппеты и поколения курсоров, а потребитель со стороны модели владеет полномочиями рабочей области и рендером без курсоров. |
| `ctx.fileReferences` | `seam` | [`file-reference`](../packages/context/file-reference) | [`file-reference-local`](../packages/context/file-reference-local) | - | - | Интерфейс возвращает кандидатов автодополнения, состоящих только из путей, внутри адресуемого cwd Агента через свой контракт unary Remote; провайдеры владеют доступом к пространству имён и ранжированием, не читая содержимое файлов. |
| `ctx.sessionReferenceResolver` | `core` | [`session-reference`](../packages/context/session-reference) | - | - | - | Проецирует ограниченные снапшоты текущей поверхности диалога в долговечный недоверенный контекст сообщений; адаптеры хоста владеют синтаксисом упоминаний. |
| `ctx.sessionTitle` | `seam` | [`session-title`](../packages/session/session-title) | [`session-title-first-prompt-llm`](../packages/session/session-title-first-prompt-llm), [`session-title-all-prompts-llm`](../packages/session/session-title-all-prompts-llm) | - | - | Владеет детерминированным фолбэком, свёрткой последнего заголовка и единственной опциональной асинхронной регистрацией провайдера. |
| `ctx.systemPrompt` | `core` | [`system-prompt`](../packages/core/system-prompt) | - | [`agent-loop`](../packages/core/agent-loop), [`tools`](../packages/core/tools), [`tool-fs`](../packages/fs/tool-fs), [`tool-terminal`](../packages/terminal/tool-terminal), [`tool-web`](../packages/web/tool-web) | - | Собирает секции промпта и видимые модели схемы инструментов для каждого шага. |
| `ctx.tools` | `core` | [`tools`](../packages/core/tools) | - | [`agent-loop`](../packages/core/agent-loop), [`tool-ask-user`](../packages/interaction/tool-ask-user), [`tool-bash`](../packages/shell/tool-bash), [`tool-cordis`](../packages/extensions/tool-cordis), [`tool-fs`](../packages/fs/tool-fs), [`tool-terminal`](../packages/terminal/tool-terminal), [`tool-skill`](../packages/skill/tool-skill), [`tool-subagent`](../packages/subagent/tool-subagent), [`tool-todo`](../packages/todo/tool-todo), [`tool-web`](../packages/web/tool-web) | - | Регистрирует возможности, владеет транспортом Code Mode и маршрутизирует вызовы через предполитику, монотонные гарды, around-диспетчеризацию, постполитику и наблюдение итогового результата. |
| `ctx.userQuestions` | `seam` | [`user-questions`](../packages/interaction/user-questions) | - | [`tool-ask-user`](../packages/interaction/tool-ask-user) | - | Фронтенды UI предоставляют активного провайдера ответов человека; tool-ask-user приостанавливает вызов инструмента на независимом от провайдера промисе ask(). |
| `ctx.planMode` | `core` | [`plan-mode`](../packages/plan/plan-mode) | - | - | - | Свёртывает журнальное состояние plan/mode, сбрасывает выбор пользователя на границах ходов, рендерит принадлежащее развёртыванию руководство, регистрирует /plan и сохраняет стабильность схемы выхода из плана между переходами. |
| `ctx.agentPresets` | `core` | [`agent-presets`](../packages/preset/agent-presets) | - | - | - | Обнаруживает каталоги пресетов по доверенным и созданным пользователями корням и монтирует один пресет cordis.yml под scope агента во время создания, отвергая строку, которая никогда не активируется или публикует в корневую область сервисов. |
| `ctx.commands` | `core` | [`commands`](../packages/interaction/commands) | - | - | - | Плагины регистрируют прямые команды человека, не отправляя вызовы модели. |
| `ctx.sessionProjections` | `core` | [`session-projection`](../packages/session/session-projection) | - | [`tool-todo`](../packages/todo/tool-todo), [`session-title`](../packages/session/session-title), [`host-apiproxy`](../packages/host/apiproxy) | - | Домены регистрируют управляемые состоянием единицы-свёртки; энергичный драйвер ведёт посессионные watermark-состояния, а api-proxy раздаёт базовые значения и доставляет изменившиеся. |
| `ctx.sessionProjectionCache` | `core` | [`session-projection-cache`](../packages/session/session-projection-cache) | - | [`host-apiproxy`](../packages/host/apiproxy) | - | Выполняет долговечные чекпоинты состояний единиц проекций по каждой сессии (с троттлингом + обязательные точки turn/end/detach) и обслуживает лестницу холодного чтения: строка кеша + воспроизведение хвоста персистентности, так что списки никогда не загружают полные журналы. |
| `ctx.skills` | `seam` | [`skill`](../packages/skill/skill) | [`skill-badge`](../packages/skill/skill-badge), [`skill-filesystem`](../packages/skill/skill-filesystem) | [`tool-skill`](../packages/skill/tool-skill) | - | Сливает каталоги скиллов провайдеров; tool-skill рендерит каталог префикса сессии и загружает полные тела скиллов. |
| `ctx.agents` | `core` | [`agent`](../packages/core/agent) | - | [`agent-loop`](../packages/core/agent-loop), [`acp`](../packages/acp/acp), `subagent-inprocess` | - | Владеет живыми дескрипторами Агентов, seam'ом фабрики create/resume и локальным для процесса распространением инициатора. |
| `ctx.agentDefaultModel` | `core` | [`agent-default-model`](../packages/core/agent-default-model) | - | [`headless`](../packages/bundle/headless), [`host-apiproxy`](../packages/host/apiproxy) | - | Раскладывает ModelSelection по умолчанию слоями через настройки, чтобы прямые и хостовые точки входа Агента делили одного владельца состояния. |
| `ctx.agentLoop` | `bundle` | [`agent-loop`](../packages/core/agent-loop) | - | [`agent-spine-demo`](../packages/examples/agent-spine-demo) | - | Единственный конкретный плагин цикла; пакеты-расширения зависят от событий и сервисов dsh-agent, а не от этого пакета. |
| `ctx.goals` | `core` | [`goal`](../packages/goal/goal) | - | - | - | Свёртывает версионированное состояние целей из журнала сессии и держит активацию живых продолжений локальной для процесса. |
| `ctx.e2b` | `core` | [`e2b`](../packages/e2b/e2b) | - | [`fs-e2b`](../packages/e2b/fs-e2b), [`subprocess-e2b`](../packages/e2b/subprocess-e2b) | - | Владеет одним общим дескриптором E2B SDK, удалённой рабочей папкой и итоговым распоряжением песочницей, чтобы оба базовых провайдера E2B обитали в одном рантайме Linux. |
| `ctx.subprocess` | `seam` | [`subprocess`](../packages/subprocess/subprocess) | [`subprocess-local`](../packages/subprocess/subprocess-local), [`subprocess-e2b`](../packages/e2b/subprocess-e2b) | [`bash-local`](../packages/shell/bash-local), [`bash-sandbox`](../packages/shell/bash-sandbox), [`terminal-bash`](../packages/terminal/terminal-bash), [`lsp-stdio`](../packages/lsp/lsp-stdio), [`subagent-acp`](../packages/subagent/subagent-acp), [`subagent-codex`](../packages/subagent/subagent-codex), [`subagent-claude-code`](../packages/subagent/subagent-claude-code) | - | Исполнители bash, PTY-бэкенд оболочки, хост LSP и работающие вне процесса бэкенды субагентов ACP, Codex и Claude Code порождаются через ctx.subprocess; сервис владеет координатами процесса, временем жизни дерева/сессии, диспозициями stdio, терминальной механикой и эскалацией kill. |
| `ctx.shell` | `seam` | [`shell`](../packages/shell/shell) | [`bash-local`](../packages/shell/bash-local), [`bash-sandbox`](../packages/shell/bash-sandbox), [`pwsh-local`](../packages/shell/pwsh-local) | [`tool-bash`](../packages/shell/tool-bash), [`tool-pwsh`](../packages/shell/tool-pwsh), [`hooks-claude-code`](../packages/hooks/hooks-claude-code), [`hooks-codex`](../packages/hooks/hooks-codex) | - | Видимые модели инструменты оболочки и хук-мосты используют этот seam; исполнители в песочнице, удалённые или PowerShell заменяют bash-local, не затрагивая их. |
| `ctx.shellEnv` | `core` | [`shell-env`](../packages/shell/shell-env) | - | [`tool-bash`](../packages/shell/tool-bash), [`tool-pwsh`](../packages/shell/tool-pwsh) | - | Плагины объявляют факты DSH_* в области эффектов; каждый инструмент оболочки собирает один доверенный снапшот на каждое исполнение, а его исполнитель заново собирает пространство имён. |
| `ctx.terminals` | `seam` | [`terminal`](../packages/terminal/terminal) | [`terminal-bash`](../packages/terminal/terminal-bash) | [`tool-terminal`](../packages/terminal/tool-terminal) | - | Реестр владеет идентичностью сессии конкретного Агента и очисткой; бэкенды владеют терминальной механикой, а tool-terminal открывает ограниченные владельцем инструменты модели. |
| `ctx.sandbox` | `seam` | [`sandbox`](../packages/sandbox/sandbox) | [`sandbox-local`](../packages/sandbox/sandbox-local) | [`bash-sandbox`](../packages/shell/bash-sandbox), [`terminal-bash`](../packages/terminal/terminal-bash) | - | Потребители передают точный argv, который собираются породить; same-world бэкенды оборачивают его под политику на каждый вызов и отчитываются о применении. |
| `ctx.sandboxPolicy` | `core` | [`sandbox-policy`](../packages/sandbox/sandbox-policy) | - | [`bash-sandbox`](../packages/shell/bash-sandbox), [`fs-sandbox`](../packages/fs/fs-sandbox), [`terminal-bash`](../packages/terminal/terminal-bash) | - | Единственное место определения режима по умолчанию развёртывания + корня рабочей области; сервис читают только исполнитель и провайдер в песочнице (слои инструментов используют чистую свёртку `sandbox/mode`, которую он также экспортирует). Оба применяющих семейства читают его, чтобы bash и fs не могли быть ограничены разными корнями. |
| `ctx.approval` | `seam` | `approval` | [`acp`](../packages/acp/acp) | [`tools`](../packages/core/tools), [`tool-bash`](../packages/shell/tool-bash) | - | Одноразовые решения о разрешениях, доставляемые через каскад `approval/request`; отвечающие — слушатели (мост ACP для своих агентов), отсутствие даёт отказ `unavailable` (fail closed). |
| `ctx.permissionPresets` | `core` | [`permission-presets`](../packages/interaction/permission-presets) | - | - | - | Видимая пользователю таблица пресетов (`workspace-write`/`danger-full-access`), объединяющая ручки режима песочницы и политики одобрения; переключение проводит одно событие `permission/preset` до обоих событий-ручок. |
| `ctx.codeRuntime` | `seam` | [`code-runtime`](../packages/code-runtime/code-runtime) | `code-runtime-worker` | [`tools`](../packages/core/tools) | - | Запускает одну написанную моделью программу против предоставленных хостом асинхронных привязок; бэкенды различаются субстратом и языком (реестр инструментов использует его для Code Mode). |
| `ctx.fs` | `seam` | [`fs`](../packages/fs/fs) | [`fs-local`](../packages/fs/fs-local), [`fs-sandbox`](../packages/fs/fs-sandbox), [`fs-e2b`](../packages/e2b/fs-e2b) | [`tool-fs`](../packages/fs/tool-fs) | [`fs-observation-policy`](../packages/fs/fs-observation-policy) | tool-fs исполняет read/write/edit через ctx.fs; fs-sandbox ограждает мутации общим режимом песочницы; fs-observation-policy добавляет проверки наблюдаемого состояния через гейт событий fs/*. |
| `ctx.compaction` | `seam` | [`compaction`](../packages/compaction/compaction) | [`compaction-basic`](../packages/compaction/compaction-basic) | [`compaction-basic`](../packages/compaction/compaction-basic) | - | Базовый бэкенд использует события давления после шага и восстановления после ошибок запроса; видимого модели инструмента компакции нет. |
| `ctx.subagents` | `seam` | [`subagent`](../packages/subagent/subagent) | [`subagent-spawn-in-process`](../packages/subagent/subagent-spawn-in-process), [`subagent-fork-in-process`](../packages/subagent/subagent-fork-in-process), [`subagent-acp`](../packages/subagent/subagent-acp), [`subagent-codex`](../packages/subagent/subagent-codex), [`subagent-claude-code`](../packages/subagent/subagent-claude-code), [`subagent-dsh-sdk`](../packages/subagent/subagent-dsh-sdk) | [`tool-subagent`](../packages/subagent/tool-subagent), [`tool-subagent-control`](../packages/subagent/tool-subagent-control), [`tool-ralph`](../packages/workflow/tool-ralph) | - | Провайдеры реализуют транспорты; сервис также владеет опциональной оркестрацией продолжений на основе Activation; tool-subagent выбирает одноразовую или продолжаемую делегацию, tool-subagent-control доставляет последующие обращения, а tool-ralph требует один свежий маршрут структурированного вывода. |
| `ctx.agentTeams` | `core` | `agent-team` | - | `tool-agent-team` | - | Владеет ростером с неявным корнем, долговечным почтовым ящиком пиров, общим DAG задач и жизненным циклом продолжаемых детей; tool-agent-team добавляет ограниченную по scope политику модели и средства управления. |
| `ctx.jobs` | `seam` | [`jobs`](../packages/jobs/jobs) | [`jobs-local`](../packages/jobs/jobs-local) | [`tool-bash`](../packages/shell/tool-bash), [`tool-terminal`](../packages/terminal/tool-terminal), [`tool-subagent`](../packages/subagent/tool-subagent), [`tool-jobs`](../packages/jobs/tool-jobs) | - | Производители (фоновый bash, отправки PTY и делегации субагентам) регистрируют идущую работу; tool-jobs — видимый модели контроллер, который читает её, составляет списки и убивает; jobs-local — локальный для процесса реестр. |
| `ctx.web` | `seam` | [`web`](../packages/web/web) | [`web-search-exa`](../packages/web/web-search-exa), [`web-search-perplexity`](../packages/web/web-search-perplexity), [`web-search-deepseek`](../packages/web/web-search-deepseek), [`web-fetch-http`](../packages/web/web-fetch-http) | [`tool-web`](../packages/web/tool-web) | - | Поисковые и fetch-провайдеры регистрируются в одном seam ctx.web; tool-web владеет стабильными видимыми модели именами. |
| `ctx.spillStore` | `seam` | [`spill`](../packages/spill/spill) | [`spill-local`](../packages/spill/spill-local) | [`spill-policy`](../packages/spill/spill-policy) | - | Бэкенд сохраняет чрезмерно большой текст инструмента и возвращает видимый модели локатор вместе с подсказкой по извлечению; spill-policy — потребитель tools/post-execute, решающий, когда выполнять spill. |
| `ctx.directoryPicker` | `seam` | `directory-picker` | `directory-picker-native`, `directory-picker-browse` | `apiproxy` | - | Различаемая интерактивная возможность: нативный бэкенд открывает один системный chooser на дисплее хоста, browse-бэкенд обслуживает примитивы просмотра/создания для встроенного браузера; двуликие бэкенды заполняют slot'ы потока работы с каталогами в ui-workspace своими браузерными половинами (без анонсирования по протоколу). |
| `ctx.webServer` | `core` | `webserver` | - | `connection`, `modules`, `hmr` | - | Простой носитель node:http: реестр именованных маршрутов, точки перехвата преобразования индекса и статический фолбэк dist; web-transport плагины регистрируют собственные маршруты. |
| `ctx.clientModules` | `core` | `modules` | - | `hmr` | - | Собирает входной граф __DSH_BOOT__ из инкрементального сканирования dsh.client, раздаёт бандлы плагинов и уведомляет подписчиков rebuilt/graph-changed. |
| `ctx.workflowEngine` | `seam` | [`workflow`](../packages/workflow/workflow) | [`workflow-worker-thread`](../packages/workflow/workflow-worker-thread) | [`tool-workflow`](../packages/workflow/tool-workflow), [`tool-ralph`](../packages/workflow/tool-ralph) | - | Один движок на контекст, как в bash, без реестра именованных провайдеров; общий воркфлоу и фиксированный потребитель Ralph запускают прогоны, чьи вызовы agent() расходятся веером через ctx.subagents. |
| `ctx.lsp` | `seam` | [`lsp`](../packages/lsp/lsp) | `lsp-local` | [`tool-lsp`](../packages/lsp/tool-lsp) | - | Регистрация и выбор провайдеров плюс выполнение нормализованных запросов ровно по четырём операциям; seam не предлагает протокольной лазейки, поэтому бэкенд транслирует в нормализованные запрос и результат. |
| `ctx.apiProxy` | `core` | `apiproxy` | - | `connection` | - | Лицо шлюза хоста, независимое от транспорта: он диспетчеризует вызовы API браузера, и каждый открытый поток хоста подписывается на события, которые тот пересылает, а не получает их через broadcast-глагол. |
| `ctx.dynamicCordisRunner` | `core` | [`cordis-host-runner`](../packages/extensions/cordis-host-runner) | - | [`tool-cordis`](../packages/extensions/tool-cordis) | - | Владеет реестром определений в памяти, vm-песочницей для хостовых половин и полным циклом «запрос–запуск»; страницы браузера достигают того же сервиса по протоколу через его remote-пространство имён. |
| `ctx.cordisInspect` | `core` | [`cordis-host-runner`](../packages/extensions/cordis-host-runner) | - | [`tool-cordis`](../packages/extensions/tool-cordis) | - | Регистрирует хостовые inspect-провайдеры, зеркалирует манифест клиентских провайдеров и маршрутизирует клиентские запросы через динамический транспорт Cordis. |

Режим сопровождения: гибридный: сервисы обнаруживаются из деклараций Cordis; роли interface/implementation/consumer классифицируются в `scripts/gen-doc-graphs.ts` с гардом полноты.
