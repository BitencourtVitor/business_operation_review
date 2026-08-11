package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/bitencourtVitor/bor2-api/internal/config"
	"github.com/bitencourtVitor/bor2-api/internal/handler"
	"github.com/bitencourtVitor/bor2-api/internal/jobs"
	"github.com/bitencourtVitor/bor2-api/internal/middleware"
	"github.com/bitencourtVitor/bor2-api/internal/pipeline/quickbooks"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load config: %v\n", err)
		os.Exit(1)
	}

	logger.Init(cfg.App.Env)

	// ── Database ──────────────────────────────────────────────────────────────
	db, err := pgxpool.New(context.Background(), cfg.Database.URL)
	if err != nil {
		logger.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.Ping(context.Background()); err != nil {
		logger.Error("database ping failed", "error", err)
		os.Exit(1)
	}
	logger.Info("database connected")

	// ── Repositories ──────────────────────────────────────────────────────────
	userRepo := repository.NewPostgresUserRepository(db)
	sessionRepo := repository.NewPostgresSessionRepository(db)
	forecastRepo := repository.NewPostgresForecastRepository(db)
	accountingRepo := repository.NewPostgresAccountingRepository(db)
	subcontractorRepo := repository.NewPostgresSubcontractorRepository(db)
	permitRowRepo := repository.NewPostgresPermitRowRepository(db)
	serviceRequestRepo := repository.NewPostgresServiceRequestRepository(db)
	timesheetRowRepo := repository.NewPostgresTimesheetRowRepository(db)
	employeeNameRepo := repository.NewPostgresEmployeeNameRepository(db)
	takeoffRepo := repository.NewPostgresTakeoffWorkRepository(db)
	destaqueRepo := repository.NewPostgresDestaqueRepository(db)
	oportunidadeRepo := repository.NewPostgresOportunidadeRepository(db)
	planoDeAcaoRepo := repository.NewPostgresPlanoDeAcaoRepository(db)
	receivableRepo := repository.NewPostgresReceivableRepository(db)
	payableRepo := repository.NewPostgresPayableRepository(db)
	notificationRepo := repository.NewPostgresNotificationRepository(db)
	auditLogRepo := repository.NewPostgresAuditLogRepository(db)
	qbCredsRepo := repository.NewPostgresQBCredentialsRepository(db)
	wexCatRepo := repository.NewPostgresWexCategorizationRepository(db)
	qbtimeTeamRepo := repository.NewPostgresQBTimeTeamRepository(db)
	qbtimeEmployeeTeamRepo := repository.NewPostgresQBTimeEmployeeTeamRepository(db)
	qbtimeExceptionsRepo := repository.NewPostgresQBTimeExceptionsRepository(db)
	qbtimePeriodCacheRepo := repository.NewPostgresQBTimePeriodCacheRepository(db)
	qbtimeUnpaidAddrRepo := repository.NewPostgresQBTimeUnpaidAddressRepository(db)
	qbtimeAbsenceRepo := repository.NewPostgresQBTimeAbsenceRepository(db)

	// ── Services ──────────────────────────────────────────────────────────────
	auditService := service.NewAuditService(auditLogRepo)
	authService := service.NewAuthService(userRepo, sessionRepo)
	forecastService := service.NewForecastService(forecastRepo)
	accountingService := service.NewAccountingService(accountingRepo)
	subcontractorService := service.NewSubcontractorService(subcontractorRepo)
	permitRowService := service.NewPermitRowService(permitRowRepo)
	serviceRequestService := service.NewServiceRequestService(serviceRequestRepo)
	timesheetRowService := service.NewTimesheetRowService(timesheetRowRepo)
	employeeNameService := service.NewEmployeeNameService(employeeNameRepo)
	takeoffService := service.NewTakeoffWorkService(takeoffRepo)
	destaqueService := service.NewDestaqueService(destaqueRepo)
	oportunidadeService := service.NewOportunidadeService(oportunidadeRepo)
	planoDeAcaoService := service.NewPlanoDeAcaoService(planoDeAcaoRepo)
	receivableService := service.NewReceivableService(receivableRepo)
	payableService := service.NewPayableService(payableRepo)
	notificationService := service.NewNotificationService(notificationRepo)
	qbOAuthService := service.NewQBOAuthService(qbCredsRepo)
	wexCatService := service.NewWexCategorizationService(wexCatRepo)
	qbtimeTeamSvc := service.NewQBTimeTeamService(qbtimeTeamRepo)
	qbtimeEmployeeTeamSvc := service.NewQBTimeEmployeeTeamService(qbtimeEmployeeTeamRepo)
	whosWorkingSvc := service.NewWhosWorkingService(qbtimeExceptionsRepo, qbtimeTeamRepo, qbtimeEmployeeTeamRepo)
	qbtimeAbsenceSvc := service.NewQBTimeAbsenceService(qbtimeAbsenceRepo, notificationService)

	// ── Handlers ──────────────────────────────────────────────────────────────
	healthHandler := handler.NewHealthHandler()
	authHandler := handler.NewAuthHandler(authService, auditService)
	forecastHandler := handler.NewForecastHandler(forecastService, auditService)
	accountingHandler := handler.NewAccountingHandler(accountingService, auditService)
	subcontractorHandler := handler.NewSubcontractorHandler(subcontractorService, auditService)
	permitRowHandler := handler.NewPermitRowHandler(permitRowService, auditService)
	serviceRequestHandler := handler.NewServiceRequestHandler(serviceRequestService, auditService)
	timesheetRowHandler := handler.NewTimesheetRowHandler(timesheetRowService)
	employeeNameHandler := handler.NewEmployeeNameHandler(employeeNameService, auditService)
	takeoffHandler := handler.NewTakeoffWorkHandler(takeoffService, auditService)
	destaqueHandler := handler.NewDestaqueHandler(destaqueService, auditService, authService, db)
	oportunidadeHandler := handler.NewOportunidadeHandler(oportunidadeService, auditService, authService, db)
	planoDeAcaoHandler := handler.NewPlanoDeAcaoHandler(planoDeAcaoService, auditService, authService, db)
	receivableHandler := handler.NewReceivableHandler(receivableService, auditService)
	payableHandler := handler.NewPayableHandler(payableService, auditService)
	notificationHandler := handler.NewNotificationHandler(notificationService, authService, db, auditService)
	timesheetUploadHandler := handler.NewTimesheetUploadHandler(db)
	ofiHandler := handler.NewOFIHandler(db)
	workforceHandler := handler.NewWorkforceHandler(db)
	workforceUploadRepo := repository.NewPostgresWorkforceUploadRepository(db)
	workforceUploadSvc := service.NewWorkforceUploadService(workforceUploadRepo)
	workforceUploadHandler := handler.NewWorkforceUploadHandler(workforceUploadSvc, auditService)
	workforceRuleRepo := repository.NewPostgresWorkforceAttributionRuleRepository(db)
	workforceRuleSvc := service.NewWorkforceAttributionRuleService(workforceRuleRepo)
	workforceRuleHandler := handler.NewWorkforceAttributionRuleHandler(workforceRuleSvc, auditService)
	qbtWfImportSvc := service.NewQBTimeWorkforceImportService(workforceUploadRepo)
	qbtWfImportHandler := handler.NewQBTimeWorkforceImportHandler(qbtWfImportSvc, auditService)
	settingsHandler := handler.NewSettingsHandler(db, auditService)
	inventoryHandler := handler.NewInventoryHandler(db)
	qbHandler := handler.NewQBHandler(qbOAuthService)
	wexCatHandler := handler.NewWexCategorizationHandler(wexCatService)
	qbtimeTeamHandler := handler.NewQBTimeTeamHandler(qbtimeTeamSvc, auditService)
	qbtimeEmployeeTeamHandler := handler.NewQBTimeEmployeeTeamHandler(qbtimeEmployeeTeamSvc, auditService)
	whosWorkingHandler := handler.NewWhosWorkingHandler(whosWorkingSvc, auditService)
	qbtimeAbsenceHandler := handler.NewQBTimeAbsenceHandler(qbtimeAbsenceSvc)
	weeklyReportSvc := service.NewWeeklyReportService()
	weeklyReportHandler := handler.NewWeeklyReportHandler(weeklyReportSvc)
	periodReportSvc := service.NewPeriodReportService(qbtimeTeamRepo, qbtimeEmployeeTeamRepo, qbtimePeriodCacheRepo, qbtimeUnpaidAddrRepo)
	periodReportHandler := handler.NewPeriodReportHandler(periodReportSvc)
	qbAccountingHandler := handler.NewQBAccountingHandler(db)
	budgetHandler := handler.NewBudgetHandler(db, periodReportSvc)
	budgetTaxonomyHandler := handler.NewBudgetTaxonomyHandler(db)
	// Shared transactional delivery is composed once and injected into every feature that sends mail.
	emailSender := service.NewGmailAPISenderFromEnv()
	alertRecipients := service.NewAlertRecipientDirectory(db)
	emailTriggerService := service.NewEmailTriggerService(db)
	emailTriggersHandler := handler.NewEmailTriggersHandler(emailTriggerService)
	workersCompReviewService := service.NewWorkersCompReviewService(db, emailSender, emailTriggerService)
	subcontractorDocsHandler := handler.NewSubcontractorDocsHandler(db, emailSender)
	workersCompReviewHandler := handler.NewWorkersCompReviewHandler(workersCompReviewService)
	qbtimeMappingHandler := handler.NewQBTimeMappingHandler(db)
	catalogHandler := handler.NewForecastCatalogHandler(db, auditService)
	buildingsHandler := handler.NewBuildingsHandler(db, auditService)
	aiSQLLLM := service.NewOpenRouterClient(cfg.AI.OpenRouterKey, cfg.AI.SQLModel)
	aiAnalystLLM := service.NewOpenRouterClient(cfg.AI.OpenRouterKey, cfg.AI.AnalystModel)
	// Aria must query through the read-only aria_ro role so RLS enforces company
	// isolation. Falling back to the main (superuser) pool would BYPASS RLS, so we
	// only allow that in development. In production a missing URL disables querying.
	var ariaSQL *service.AriaSQL
	ariaDBURL := cfg.AI.ReadOnlyDBURL
	if ariaDBURL == "" && cfg.App.Env != "production" {
		ariaDBURL = cfg.Database.URL
		logger.Error("ARIA_READONLY_DATABASE_URL not set — dev fallback to main DB")
	}
	if ariaDBURL != "" {
		ariaPool, err := pgxpool.New(context.Background(), ariaDBURL)
		if err != nil {
			logger.Error("failed to connect aria read-only pool", "error", err)
			os.Exit(1)
		}
		defer ariaPool.Close()
		ariaSQL = service.NewAriaSQL(ariaPool)
	} else {
		logger.Error("Aria SQL disabled — set ARIA_READONLY_DATABASE_URL to enable (required in production for RLS isolation)")
	}
	service.ValidateSchema(context.Background(), db)
	ariaDict, err := service.BuildDataDictionary(context.Background(), db)
	if err != nil {
		logger.Error("failed to build aria data dictionary", "error", err)
	}
	aiService := service.NewAIService(db, aiSQLLLM, aiAnalystLLM, ariaSQL, ariaDict)
	go aiService.WarmPrimers(context.Background(), "framing", "hvac", "pcg")
	aiChatHandler := handler.NewAIChatHandler(aiService, authService)

	// ── Fiber App ─────────────────────────────────────────────────────────────
	app := fiber.New(fiber.Config{
		AppName:      "BOR2 API v1.0.0",
		BodyLimit:    10 * 1024 * 1024, // 10MB for CSV uploads
		ErrorHandler: errorHandler,
	})

	app.Use(recover.New())
	app.Use(requestid.New())
	app.Use(middleware.CORS(cfg.App.AllowedOrigins))

	// ── Routes ────────────────────────────────────────────────────────────────
	app.Get("/", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "service": "bor2-api", "version": "1.0.0"})
	})
	app.Get("/health", healthHandler.Health)

	v1 := app.Group("/api/v1")

	// Auth
	auth := v1.Group("/auth")
	auth.Post("/login", authHandler.Login)
	auth.Post("/forgot-password", authHandler.ForgotPassword)
	auth.Post("/logout", middleware.RequireAuth(), authHandler.Logout)
	auth.Get("/me", middleware.RequireAuth(), authHandler.Me)
	auth.Post("/change-password", middleware.RequireAuth(), authHandler.ChangePassword)

	// ── Cron-guarded routes (X-Cron-Secret or admin session; NO user session) ────
	// Registered BEFORE the RequireAuth group below so the positional auth
	// middleware never enters their chain — the scheduler calls these with only the
	// cron secret and no Bearer token. (Registering them after RequireAuth tainted
	// the response with a 401 even though the handler ran.)
	qbTriggerSyncer := quickbooks.NewSyncer(db)
	qbTriggerSandbox := cfg.App.Env != "production"
	v1.Post("/qbtime/period-report/sync", middleware.RequireCronOrAdmin(cfg.App.CronSecret, authService), periodReportHandler.Sync)
	v1.Post("/qbtime/workforce-import", middleware.RequireCronOrAdmin(cfg.App.CronSecret, authService), qbtWfImportHandler.Import)
	v1.Post("/qbtime/employee-teams/sync", middleware.RequireCronOrAdmin(cfg.App.CronSecret, authService), qbtimeEmployeeTeamHandler.Sync)
	v1.Post("/qbtime/absences/detect", middleware.RequireCronOrAdmin(cfg.App.CronSecret, authService), qbtimeAbsenceHandler.Detect)
	v1.Post("/ofi/calculate", middleware.RequireCronOrAdmin(cfg.App.CronSecret, authService), ofiHandler.Calculate)
	v1.Post("/qb/sync", middleware.RequireCronOrAdmin(cfg.App.CronSecret, authService), func(c *fiber.Ctx) error {
		go func() {
			ctx := context.Background()
			var clients []*quickbooks.Client
			for _, company := range quickbooks.AllCompanies {
				at, rt, realm, cid, csec, err := qbOAuthService.SyncClientConfig(ctx, string(company))
				if err != nil {
					logger.Error("qb sync trigger: token unavailable", "company", company, "error", err)
					continue
				}
				clients = append(clients, quickbooks.NewClient(company, quickbooks.CompanyConfig{
					RealmID: realm, AccessToken: at,
					RefreshToken: rt, ClientID: cid, ClientSecret: csec,
				}, qbTriggerSandbox).WithRefresher(qbOAuthService))
			}
			if len(clients) == 0 {
				logger.Error("qb sync trigger: no companies with valid tokens")
				return
			}
			logger.Info("qb sync trigger: starting", "companies", len(clients))
			qbTriggerSyncer.SyncAll(ctx, clients)
			qbTriggerSyncer.ReconcileDeletions(ctx, clients, quickbooks.ReconcileEntities)
			logger.Info("qb sync trigger: done")
		}()
		return c.JSON(fiber.Map{"status": "sync started"})
	})

	// QuickBooks OAuth (dev/admin — no auth middleware on callback so QB can redirect;
	// /token uses a service secret for machine-to-machine calls like AutoAccounting).
	// Registered before the catch-all RequireAuth below so /token and /seed aren't
	// blocked by user-session auth they were never meant to require.
	qb := v1.Group("/qb")
	qb.Get("/auth", middleware.RequireAuth(), qbHandler.Auth)
	qb.Get("/callback", qbHandler.Callback)
	qb.Post("/refresh", middleware.RequireAuth(), qbHandler.Refresh)
	qb.Get("/token", middleware.RequireServiceSecret(cfg.App.AutoAccountingServiceSecret), qbHandler.Token)
	qb.Post("/seed", qbHandler.Seed) // internal bootstrap — no user session needed

	// Protected routes
	api := v1.Group("", middleware.RequireAuth())

	// Clients & Job Sites catalog — registered BEFORE forecast /:id to avoid wildcard capture
	clientsHandler := handler.NewForecastClientsHandler(db, auditService)
	clients := api.Group("/forecast/clients")
	clients.Get("", clientsHandler.ListClients)
	clients.Post("", clientsHandler.AddClient)
	clients.Patch("/:id", clientsHandler.UpdateClient)
	clients.Delete("/:id", clientsHandler.DeleteClient)

	jobSites := api.Group("/forecast/job-sites")
	jobSites.Get("", clientsHandler.ListJobSites)
	jobSites.Post("", clientsHandler.AddJobSite)
	jobSites.Patch("/:id", clientsHandler.UpdateJobSite)
	jobSites.Delete("/:id", clientsHandler.DeleteJobSite)

	// Forecast Catalog (C_ tables) — registered BEFORE forecast /:id for same reason
	catalog := api.Group("/forecast/catalog")
	catalog.Get("/:table", catalogHandler.List)
	catalog.Post("/:table", catalogHandler.Add)
	catalog.Delete("/:table/:id", catalogHandler.Delete)
	catalog.Patch("/contract-steps/reorder", catalogHandler.Reorder)
	catalog.Patch("/:table/:id", catalogHandler.Update)

	// Forecast
	forecast := api.Group("/forecast")
	forecast.Get("/", forecastHandler.List)
	forecast.Post("/", forecastHandler.Create)
	forecast.Patch("/fieldwire/:fwid", forecastHandler.ToggleFieldwire)
	forecast.Patch("/machine/:mid", forecastHandler.ToggleMachine)
	forecast.Patch("/machine/:mid/unit", forecastHandler.UpdateMachineUnit)
	forecast.Patch("/contract/:stepid", forecastHandler.ToggleContractStep)
	forecast.Post("/contract", forecastHandler.CreateContractStep)
	forecast.Delete("/contract/team", forecastHandler.DeleteContractTeam)
	forecast.Post("/contract/team", forecastHandler.AddContractTeam)
	forecast.Put("/:id", forecastHandler.Update)
	forecast.Delete("/:id", forecastHandler.Delete)
	forecast.Get("/:id", forecastHandler.Get)

	// Accounting
	accounting := api.Group("/accounting")
	accounting.Get("/", accountingHandler.List)
	accounting.Get("/summary", accountingHandler.Summary)
	accounting.Get("/:id", accountingHandler.Get)
	accounting.Post("/", accountingHandler.Create)
	accounting.Put("/:id", accountingHandler.Update)
	accounting.Delete("/:id", accountingHandler.Delete)

	// Subcontractors
	subs := api.Group("/subcontractors")
	subs.Get("/", subcontractorHandler.List)
	subs.Get("/:id", subcontractorHandler.Get)
	subs.Post("/", subcontractorHandler.Create)
	subs.Patch("/:id/status", subcontractorHandler.UpdateStatus)

	// QBTime Teams
	qbtimeTeams := api.Group("/qbtime/teams")
	qbtimeTeams.Get("/", qbtimeTeamHandler.List)
	qbtimeTeams.Post("/", middleware.RequirePermission(db, "settings_teams", "write"), qbtimeTeamHandler.Create)
	qbtimeTeams.Patch("/:id", middleware.RequirePermission(db, "settings_teams", "write"), qbtimeTeamHandler.Update)
	qbtimeTeams.Delete("/:id", middleware.RequirePermission(db, "settings_teams", "write"), qbtimeTeamHandler.Delete)

	// QBTime Employee Teams (synced from QB Time Groups, with manual override)
	qbtimeEmployeeTeams := api.Group("/qbtime/employee-teams")
	qbtimeEmployeeTeams.Get("/", qbtimeEmployeeTeamHandler.List)
	// Full auth (resolves userName) so the audit log and "overridden by" record who acted.
	qbtimeEmployeeTeams.Patch("/:id/override", middleware.RequirePermission(db, "settings_teams", "write"), qbtimeEmployeeTeamHandler.SetOverride)
	qbtimeEmployeeTeams.Delete("/:id/override", middleware.RequirePermission(db, "settings_teams", "write"), qbtimeEmployeeTeamHandler.ClearOverride)
	// (POST /qbtime/employee-teams/sync is cron-guarded, registered above before RequireAuth.)

	// QBTime Who's Working
	api.Get("/qbtime/whos-working", whosWorkingHandler.Get)

	// ── QB Time Absences ──────────────────────────────────────────────────────
	api.Get("/qbtime/absences", qbtimeAbsenceHandler.Get)
	api.Get("/qbtime/absences/attendance", qbtimeAbsenceHandler.Attendance)
	// (POST /qbtime/absences/detect is cron-guarded, registered above before RequireAuth.)

	// QBTime Weekly Report
	api.Get("/qbtime/weekly-report", weeklyReportHandler.Get)

	// QBTime Period Report
	api.Get("/qbtime/period-report/periods", periodReportHandler.GetPeriods)
	api.Get("/qbtime/period-report/intervals", periodReportHandler.GetIntervals)
	api.Get("/qbtime/period-report/accounting", periodReportHandler.GetAccounting)
	api.Get("/qbtime/period-report/addresses", periodReportHandler.ListAddresses)
	api.Post("/qbtime/period-report/unpaid-addresses", periodReportHandler.SetUnpaidAddress)
	api.Post("/qbtime/period-report/refresh", periodReportHandler.Refresh)
	// (period-report/sync, workforce-import, qb/sync are cron-guarded and
	// registered above, before the RequireAuth group.)

	// QBTime Exceptions
	qbtimeExceptions := api.Group("/qbtime/exceptions")
	qbtimeExceptions.Get("/", whosWorkingHandler.ListExceptions)
	qbtimeExceptions.Post("/", whosWorkingHandler.UpsertException)
	qbtimeExceptions.Delete("/:id", whosWorkingHandler.DeleteException)

	// WEX Categorization
	wexNorm := api.Group("/wex/normalization")
	wexNorm.Get("/", wexCatHandler.ListNorm)
	wexNorm.Post("/", wexCatHandler.UpsertNorm)
	wexNorm.Put("/:id", wexCatHandler.UpdateNorm)
	wexNorm.Delete("/:id", wexCatHandler.DeleteNorm)

	wexReports := api.Group("/wex/reports")
	wexReports.Get("/", wexCatHandler.ListReports)
	wexReports.Post("/", wexCatHandler.CreateReport)
	wexReports.Get("/:id", wexCatHandler.GetReport)
	wexReports.Patch("/:id", wexCatHandler.PatchReport)
	wexReports.Delete("/:id", wexCatHandler.DeleteReport)

	wexIgnored := api.Group("/wex/ignored-addresses")
	wexIgnored.Get("/", wexCatHandler.ListIgnoredAddresses)
	wexIgnored.Post("/", wexCatHandler.UpsertIgnoredAddress)
	wexIgnored.Delete("/:id", wexCatHandler.DeleteIgnoredAddress)

	// Permits
	permits := api.Group("/permits")
	permits.Get("/", permitRowHandler.List)
	permits.Get("/:id", permitRowHandler.Get)
	permits.Post("/sync-sheet", permitRowHandler.SyncFromSheet)
	permits.Post("/", permitRowHandler.Create)
	permits.Put("/:id", permitRowHandler.Update)
	permits.Delete("/:id", permitRowHandler.Delete)

	// Service Requests
	serviceRequests := api.Group("/service-requests")
	serviceRequests.Get("/", serviceRequestHandler.List)
	serviceRequests.Get("/:id", serviceRequestHandler.Get)
	serviceRequests.Post("/sync-sheet", serviceRequestHandler.SyncFromSheet)
	serviceRequests.Post("/", serviceRequestHandler.Create)
	serviceRequests.Put("/:id", serviceRequestHandler.Update)
	serviceRequests.Delete("/:id", serviceRequestHandler.Delete)

	// Timesheets
	timesheets := api.Group("/timesheets")
	timesheets.Get("/", timesheetRowHandler.List)
	timesheets.Get("/:id", timesheetRowHandler.Get)
	timesheets.Post("/", timesheetRowHandler.Create)
	timesheets.Put("/:id", timesheetRowHandler.Update)
	timesheets.Delete("/:id", timesheetRowHandler.Delete)
	timesheets.Post("/upload-csv", timesheetUploadHandler.UploadCSV)

	// OFI — read/write under standard auth; calculate under cron-or-admin guard
	ofi := api.Group("/ofi")
	ofi.Get("/", ofiHandler.List)
	ofi.Get("/monthly-execution", ofiHandler.ListExecution)
	ofi.Patch("/monthly-execution/:id", ofiHandler.UpdateExecutionReason)
	// (/ofi/calculate is cron-guarded and registered above, before RequireAuth.)

	// Workforce Productivity
	workforce := api.Group("/workforce")
	workforce.Get("/", workforceHandler.List)
	workforce.Get("/uploads", workforceUploadHandler.List)
	workforce.Post("/uploads", workforceUploadHandler.Upload)
	workforce.Delete("/uploads/:id", workforceUploadHandler.Delete)
	workforce.Get("/rules", workforceRuleHandler.List)
	workforce.Post("/rules", workforceRuleHandler.Create)
	workforce.Put("/rules/:id", workforceRuleHandler.Update)
	workforce.Delete("/rules/:id", workforceRuleHandler.Delete)

	// Employee Names
	employees := api.Group("/employees")
	employees.Get("/", employeeNameHandler.List)
	employees.Get("/:id", employeeNameHandler.Get)
	employees.Post("/", employeeNameHandler.Create)
	employees.Put("/:id", employeeNameHandler.Update)
	employees.Delete("/:id", employeeNameHandler.Delete)

	// Takeoff Works
	takeoffs := api.Group("/takeoffs")
	takeoffs.Get("/", takeoffHandler.List)
	takeoffs.Get("/:id", takeoffHandler.Get)
	takeoffs.Post("/", takeoffHandler.Create)
	takeoffs.Put("/:id", takeoffHandler.Update)
	takeoffs.Delete("/:id", takeoffHandler.Delete)

	// Destaques (Highlights)
	destaques := api.Group("/destaques")
	destaques.Get("/", destaqueHandler.List)
	destaques.Get("/:id", destaqueHandler.Get)
	destaques.Post("/", destaqueHandler.Create)
	destaques.Put("/:id", destaqueHandler.Update)
	destaques.Delete("/:id", destaqueHandler.Delete)

	// Oportunidades (Opportunities)
	oportunidades := api.Group("/oportunidades")
	oportunidades.Get("/", oportunidadeHandler.List)
	oportunidades.Get("/:id", oportunidadeHandler.Get)
	oportunidades.Post("/", oportunidadeHandler.Create)
	oportunidades.Put("/:id", oportunidadeHandler.Update)
	oportunidades.Delete("/:id", oportunidadeHandler.Delete)

	// Planos de Acao (Action Plans)
	planos := api.Group("/planos-de-acao")
	planos.Get("/", planoDeAcaoHandler.List)
	planos.Get("/:id", planoDeAcaoHandler.Get)
	planos.Post("/", planoDeAcaoHandler.Create)
	planos.Put("/:id", planoDeAcaoHandler.Update)
	planos.Delete("/:id", planoDeAcaoHandler.Delete)

	// Receivables
	receivables := api.Group("/receivables")
	receivables.Get("/", receivableHandler.List)
	receivables.Get("/:id", receivableHandler.Get)
	receivables.Post("/", receivableHandler.Create)
	receivables.Put("/:id", receivableHandler.Update)
	receivables.Delete("/:id", receivableHandler.Delete)

	// Payables
	payables := api.Group("/payables")
	payables.Get("/", payableHandler.List)
	payables.Get("/:id", payableHandler.Get)
	payables.Post("/", payableHandler.Create)
	payables.Put("/:id", payableHandler.Update)
	payables.Delete("/:id", payableHandler.Delete)

	// Notifications
	notifications := api.Group("/notifications")
	notifications.Get("/", notificationHandler.List)
	notifications.Get("/all", notificationHandler.ListAll)
	notifications.Post("/", notificationHandler.Create)
	notifications.Put("/:id", notificationHandler.Update)
	notifications.Patch("/:id/viewed", notificationHandler.MarkViewed)
	notifications.Delete("/:id", notificationHandler.Delete)

	// Settings (Admin/Dev only)
	settings := api.Group("/settings")
	settings.Get("/screens", settingsHandler.GetScreens)
	settings.Get("/users", settingsHandler.GetUsers)
	settings.Post("/users", settingsHandler.CreateUser)
	settings.Put("/users/:id", settingsHandler.UpdateUser)
	settings.Delete("/users/:id", settingsHandler.DeleteUser)
	settings.Post("/users/:id/reset-password", settingsHandler.ResetUserPassword)
	settings.Patch("/users/:id/permissions", settingsHandler.UpdateUserPermissions)
	settings.Get("/me/permissions", settingsHandler.GetMyPermissions)

	// Inventory (queries Premium Storage)
	api.Get("/inventory", inventoryHandler.GetInventory)

	// QuickBooks Accounting (protected)
	qbAccounting := api.Group("/qb/accounting")
	qbAccounting.Get("/years", qbAccountingHandler.Years)
	qbAccounting.Get("/chart", qbAccountingHandler.Chart)
	qbAccounting.Get("/projects", qbAccountingHandler.Projects)
	qbAccounting.Get("/projects/detail", qbAccountingHandler.ProjectDetail)

	// Budget Control (protected, financial)
	budget := api.Group("/budget")
	budget.Get("/projects", budgetHandler.Projects)
	budget.Get("/projects/detail", budgetHandler.ProjectDetail)
	budget.Get("/customers", budgetHandler.Customers)
	// Taxonomy management (categories, mappings, per-project limits)
	budget.Get("/categories", budgetTaxonomyHandler.ListCategories)
	budget.Post("/categories", budgetTaxonomyHandler.CreateCategory)
	budget.Put("/categories/:id", budgetTaxonomyHandler.UpdateCategory)
	budget.Delete("/categories/:id", budgetTaxonomyHandler.DeleteCategory)
	budget.Get("/account-categories", budgetTaxonomyHandler.ListAccountMappings)
	budget.Put("/account-categories", budgetTaxonomyHandler.SetAccountMapping)
	budget.Get("/ghost-accounts", budgetTaxonomyHandler.ListGhostAccounts)
	budget.Put("/ghost-accounts", budgetTaxonomyHandler.SetGhostAccount)
	budget.Get("/vendor-categories", budgetTaxonomyHandler.ListVendorMappings)
	budget.Put("/vendor-categories", budgetTaxonomyHandler.SetVendorMapping)
	budget.Get("/project-limits", budgetTaxonomyHandler.ListProjectLimits)
	budget.Put("/project-limits", budgetTaxonomyHandler.SetProjectLimit)
	budget.Get("/project-dates", budgetTaxonomyHandler.GetProjectStartDate)
	budget.Put("/project-dates", budgetTaxonomyHandler.SetProjectStartDate)
	budget.Get("/project-vendor-categories", budgetTaxonomyHandler.ListProjectVendorCategories)
	budget.Put("/project-vendor-categories", budgetTaxonomyHandler.SetProjectVendorCategory)
	budget.Get("/vendor-limits", budgetTaxonomyHandler.ListVendorLimits)
	budget.Put("/vendor-limits", budgetTaxonomyHandler.SetVendorLimit)
	budget.Get("/account-limits", budgetTaxonomyHandler.ListAccountLimits)
	budget.Put("/account-limits", budgetTaxonomyHandler.SetAccountLimit)
	budget.Put("/account-limits/deadline", budgetTaxonomyHandler.SetAccountDeadline)
	budget.Get("/settings", budgetTaxonomyHandler.GetBudgetSettings)
	budget.Put("/settings", budgetTaxonomyHandler.SetBudgetSettings)
	budget.Get("/projects/account-payees", budgetHandler.AccountPayees)
	budget.Put("/payroll-supervisor", budgetTaxonomyHandler.SetPayrollSupervisor)
	budget.Get("/projects/account-history", budgetHandler.AccountPaidHistory)
	budget.Get("/projects/income-history", budgetHandler.IncomeTypeHistory)
	budget.Get("/projects/labor-estimate", budgetHandler.LaborEstimate)
	budget.Get("/projects/labor-estimate-summary", budgetHandler.LaborEstimateSummary)

	// QB Time → QBO labor mapping (initial mapping page)
	budget.Get("/qbtime-mapping/queue", qbtimeMappingHandler.Queue)
	budget.Get("/qbtime-mapping/jobsites", qbtimeMappingHandler.Jobsites)
	budget.Get("/qbtime-mapping/customers", qbtimeMappingHandler.Customers)
	budget.Post("/qbtime-mapping/accept", qbtimeMappingHandler.Accept)
	budget.Post("/qbtime-mapping/skip", qbtimeMappingHandler.Skip)
	budget.Post("/qbtime-mapping/unlink", qbtimeMappingHandler.Unlink)

	// Subcontractor Docs (compliance document tracking per subcontractor)
	subDocs := api.Group("/subcontractor-docs")
	subDocs.Get("/divisions", subcontractorDocsHandler.ListDivisions)
	subDocs.Get("/types", subcontractorDocsHandler.ListTypes)
	subDocs.Get("/contractors", subcontractorDocsHandler.ListContractors)
	// Recipient administration and test delivery are restricted server-side as
	// well as in the UI, so a direct API request cannot bypass the role rule.
	subDocs.Get("/email-recipients", middleware.RequireAuthFull(authService), middleware.RequireRole("dev", "owner", "manager"), subcontractorDocsHandler.ListEmailRecipients)
	subDocs.Put("/email-recipients", middleware.RequireAuthFull(authService), middleware.RequireRole("dev", "owner", "manager"), subcontractorDocsHandler.UpdateEmailRecipients)
	subDocs.Post("/email-recipients/test", middleware.RequireAuthFull(authService), middleware.RequireRole("dev", "owner", "manager"), subcontractorDocsHandler.SendEmailRecipientsTest)
	subDocs.Get("/workers-comp-review", middleware.RequireAuthFull(authService), middleware.RequireRole("dev", "owner", "manager"), workersCompReviewHandler.Current)
	subDocs.Patch("/workers-comp-review/checks/:id", middleware.RequireAuthFull(authService), middleware.RequireRole("dev", "owner", "manager"), workersCompReviewHandler.UpdateCheck)
	// Email Triggers — every automatic e-mail in the system, in one place.
	emailTriggers := api.Group("/email-triggers",
		middleware.RequireAuthFull(authService),
		middleware.RequireRole("dev", "owner", "manager"))
	emailTriggers.Get("/", emailTriggersHandler.List)
	emailTriggers.Put("/:key", emailTriggersHandler.Update)
	emailTriggers.Get("/:key/history", emailTriggersHandler.History)

	subDocs.Post("/contractors", subcontractorDocsHandler.CreateContractor)
	subDocs.Put("/contractors/:id", subcontractorDocsHandler.UpdateContractor)
	subDocs.Delete("/contractors/:id", subcontractorDocsHandler.DeleteContractor)
	subDocs.Patch("/contractors/:id/archive", subcontractorDocsHandler.ArchiveContractor)
	subDocs.Put("/records", subcontractorDocsHandler.SetRecord)

	// Construction Buildings & Schedules
	buildings := api.Group("/buildings")
	buildings.Get("/event-types", buildingsHandler.ListEventTypes) // static — must be before /:id
	buildings.Get("/", buildingsHandler.ListBuildings)
	buildings.Post("/", buildingsHandler.CreateBuilding)
	buildings.Put("/:id", buildingsHandler.UpdateBuilding)
	buildings.Delete("/:id", buildingsHandler.DeleteBuilding)
	buildings.Get("/:id/schedule", buildingsHandler.GetSchedule)
	buildings.Post("/:id/schedule", buildingsHandler.UpsertSchedule)
	buildings.Delete("/:id/schedule", buildingsHandler.DeleteSchedule)
	buildings.Get("/:id/schedule/history", buildingsHandler.GetScheduleHistory)
	buildings.Get("/:id/schedule/row-meta", buildingsHandler.GetScheduleRowMeta)
	buildings.Patch("/:id/schedule/row-meta/:rowId", buildingsHandler.UpsertScheduleRowMeta)
	buildings.Get("/:id/schedule/row-comments", buildingsHandler.GetAllRowComments)
	buildings.Get("/:id/schedule/row-comments/:rowId", buildingsHandler.GetRowComments)
	buildings.Post("/:id/schedule/row-comments/:rowId", middleware.RequireAuthFull(authService), buildingsHandler.AddRowComment)
	buildings.Patch("/:id/schedule/row-comments/:commentId", middleware.RequireAuthFull(authService), buildingsHandler.EditRowComment)
	buildings.Delete("/:id/schedule/row-comments/:commentId", middleware.RequireAuthFull(authService), buildingsHandler.DeleteRowComment)
	buildings.Get("/:id/events", buildingsHandler.GetBuildingEvents)
	buildings.Post("/:id/events", buildingsHandler.AddBuildingEvent)
	buildings.Patch("/:id/events/:eventId", buildingsHandler.EditBuildingEvent)
	buildings.Delete("/:id/events/:eventId", buildingsHandler.DeleteBuildingEvent)
	buildings.Get("/:id/trades", buildingsHandler.GetTradeOwnership)
	buildings.Put("/:id/trades", buildingsHandler.UpsertTradeOwnership)

	// AI Chat (Aria)
	ai := api.Group("/ai")
	ai.Post("/chat", aiChatHandler.Chat)
	ai.Get("/conversations", aiChatHandler.ListConversations)
	ai.Delete("/conversations/:id", aiChatHandler.DeleteConversation)
	ai.Patch("/conversations/:id/title", aiChatHandler.UpdateTitle)
	ai.Get("/conversations/:id/messages", aiChatHandler.ListMessages)
	ai.Get("/context/:company", aiChatHandler.GetContext)
	ai.Patch("/context/:company", aiChatHandler.UpsertContext)

	// ── Background Jobs ──────────────────────────────────────────────────────
	jobCtx, jobCancel := context.WithCancel(context.Background())
	defer jobCancel()

	alertsJob := jobs.NewForecastAlertsJob(jobs.ForecastAlertsConfig{
		DB:         db,
		Email:      emailSender,
		Recipients: alertRecipients,
	})
	workersCompReviewJob := jobs.NewWorkersCompReviewJob(workersCompReviewService)

	qbSyncJob := jobs.NewQBSyncJob(jobs.QBSyncConfig{
		Syncer:   quickbooks.NewSyncer(db),
		OAuthSvc: qbOAuthService,
		Sandbox:  cfg.App.Env != "production",
	})

	scheduler := jobs.NewScheduler(alertsJob, workersCompReviewJob, qbSyncJob)
	go scheduler.Start(jobCtx)

	// ── Graceful Shutdown ─────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		addr := fmt.Sprintf(":%s", cfg.App.Port)
		logger.Info("server starting", "addr", addr, "env", cfg.App.Env)
		if err := app.Listen(addr); err != nil {
			logger.Error("server error", "error", err)
		}
	}()

	<-quit
	logger.Info("shutting down server...")
	jobCancel()
	if err := app.Shutdown(); err != nil {
		logger.Error("shutdown error", "error", err)
	}
	logger.Info("server stopped")
}

func errorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	var e *fiber.Error
	if errors.As(err, &e) {
		code = e.Code
	}
	codeStr := "INTERNAL_ERROR"
	switch code {
	case fiber.StatusBadRequest:
		codeStr = "BAD_REQUEST"
	case fiber.StatusUnauthorized:
		codeStr = "UNAUTHORIZED"
	case fiber.StatusForbidden:
		codeStr = "FORBIDDEN"
	case fiber.StatusNotFound:
		codeStr = "NOT_FOUND"
	}
	return c.Status(code).JSON(fiber.Map{
		"error": err.Error(),
		"code":  codeStr,
	})
}
