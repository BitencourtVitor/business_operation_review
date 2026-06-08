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
	userRepo           := repository.NewPostgresUserRepository(db)
	sessionRepo        := repository.NewPostgresSessionRepository(db)
	forecastRepo       := repository.NewPostgresForecastRepository(db)
	accountingRepo     := repository.NewPostgresAccountingRepository(db)
	subcontractorRepo  := repository.NewPostgresSubcontractorRepository(db)
	samsaraRepo        := repository.NewPostgresSamsaraRepository(db)
	wexRepo            := repository.NewPostgresWexRepository(db)
	permitRowRepo      := repository.NewPostgresPermitRowRepository(db)
	serviceRequestRepo := repository.NewPostgresServiceRequestRepository(db)
	timesheetRowRepo   := repository.NewPostgresTimesheetRowRepository(db)
	projMonHvacRepo    := repository.NewPostgresProjectMonitoringHvacRepository(db)
	employeeNameRepo   := repository.NewPostgresEmployeeNameRepository(db)
	takeoffRepo        := repository.NewPostgresTakeoffWorkRepository(db)
	destaqueRepo       := repository.NewPostgresDestaqueRepository(db)
	oportunidadeRepo   := repository.NewPostgresOportunidadeRepository(db)
	planoDeAcaoRepo    := repository.NewPostgresPlanoDeAcaoRepository(db)
	receivableRepo       := repository.NewPostgresReceivableRepository(db)
	payableRepo          := repository.NewPostgresPayableRepository(db)
	notificationRepo     := repository.NewPostgresNotificationRepository(db)
	auditLogRepo         := repository.NewPostgresAuditLogRepository(db)
	qbCredsRepo          := repository.NewPostgresQBCredentialsRepository(db)
	wexCatRepo           := repository.NewPostgresWexCategorizationRepository(db)
	qbtimeTeamRepo       := repository.NewPostgresQBTimeTeamRepository(db)
	qbtimeExceptionsRepo := repository.NewPostgresQBTimeExceptionsRepository(db)
	qbtimePeriodCacheRepo := repository.NewPostgresQBTimePeriodCacheRepository(db)
	qbtimeUnpaidAddrRepo  := repository.NewPostgresQBTimeUnpaidAddressRepository(db)

	// ── Services ──────────────────────────────────────────────────────────────
	auditService          := service.NewAuditService(auditLogRepo)
	authService           := service.NewAuthService(userRepo, sessionRepo)
	forecastService       := service.NewForecastService(forecastRepo)
	accountingService     := service.NewAccountingService(accountingRepo)
	subcontractorService  := service.NewSubcontractorService(subcontractorRepo)
	permitRowService      := service.NewPermitRowService(permitRowRepo)
	serviceRequestService := service.NewServiceRequestService(serviceRequestRepo)
	timesheetRowService   := service.NewTimesheetRowService(timesheetRowRepo)
	projMonHvacService    := service.NewProjectMonitoringHvacService(projMonHvacRepo)
	employeeNameService   := service.NewEmployeeNameService(employeeNameRepo)
	takeoffService        := service.NewTakeoffWorkService(takeoffRepo)
	destaqueService       := service.NewDestaqueService(destaqueRepo)
	oportunidadeService   := service.NewOportunidadeService(oportunidadeRepo)
	planoDeAcaoService    := service.NewPlanoDeAcaoService(planoDeAcaoRepo)
	receivableService     := service.NewReceivableService(receivableRepo)
	payableService        := service.NewPayableService(payableRepo)
	notificationService  := service.NewNotificationService(notificationRepo)
	qbOAuthService       := service.NewQBOAuthService(qbCredsRepo)
	wexCatService        := service.NewWexCategorizationService(wexCatRepo)
	qbtimeTeamSvc        := service.NewQBTimeTeamService(qbtimeTeamRepo)
	whosWorkingSvc       := service.NewWhosWorkingService(qbtimeExceptionsRepo, qbtimeTeamRepo)

	// ── Handlers ──────────────────────────────────────────────────────────────
	healthHandler            := handler.NewHealthHandler()
	authHandler              := handler.NewAuthHandler(authService, auditService)
	forecastHandler          := handler.NewForecastHandler(forecastService, auditService)
	accountingHandler        := handler.NewAccountingHandler(accountingService, auditService)
	subcontractorHandler     := handler.NewSubcontractorHandler(subcontractorService, auditService)
	fuelHandler              := handler.NewFuelHandler(samsaraRepo, wexRepo)
	permitRowHandler         := handler.NewPermitRowHandler(permitRowService, auditService)
	serviceRequestHandler    := handler.NewServiceRequestHandler(serviceRequestService, auditService)
	timesheetRowHandler      := handler.NewTimesheetRowHandler(timesheetRowService)
	projMonHvacHandler       := handler.NewProjectMonitoringHvacHandler(projMonHvacService, auditService)
	employeeNameHandler      := handler.NewEmployeeNameHandler(employeeNameService, auditService)
	takeoffHandler           := handler.NewTakeoffWorkHandler(takeoffService, auditService)
	destaqueHandler          := handler.NewDestaqueHandler(destaqueService, auditService, authService, db)
	oportunidadeHandler      := handler.NewOportunidadeHandler(oportunidadeService, auditService, authService, db)
	planoDeAcaoHandler       := handler.NewPlanoDeAcaoHandler(planoDeAcaoService, auditService, authService, db)
	receivableHandler        := handler.NewReceivableHandler(receivableService, auditService)
	payableHandler           := handler.NewPayableHandler(payableService, auditService)
	notificationHandler     := handler.NewNotificationHandler(notificationService, authService, db, auditService)
	timesheetUploadHandler   := handler.NewTimesheetUploadHandler(db)
	ofiHandler               := handler.NewOFIHandler(db)
	workforceHandler         := handler.NewWorkforceHandler(db)
	workforceUploadRepo      := repository.NewPostgresWorkforceUploadRepository(db)
	workforceUploadSvc       := service.NewWorkforceUploadService(workforceUploadRepo)
	workforceUploadHandler   := handler.NewWorkforceUploadHandler(workforceUploadSvc, auditService)
	workforceRuleRepo        := repository.NewPostgresWorkforceAttributionRuleRepository(db)
	workforceRuleSvc         := service.NewWorkforceAttributionRuleService(workforceRuleRepo)
	workforceRuleHandler     := handler.NewWorkforceAttributionRuleHandler(workforceRuleSvc, auditService)
	qbtWfImportSvc           := service.NewQBTimeWorkforceImportService(workforceUploadRepo)
	qbtWfImportHandler       := handler.NewQBTimeWorkforceImportHandler(qbtWfImportSvc, auditService)
	settingsHandler          := handler.NewSettingsHandler(db, auditService)
	inventoryHandler         := handler.NewInventoryHandler(db)
	qbHandler                := handler.NewQBHandler(qbOAuthService)
	wexCatHandler            := handler.NewWexCategorizationHandler(wexCatService)
	qbtimeTeamHandler        := handler.NewQBTimeTeamHandler(qbtimeTeamSvc, auditService)
	whosWorkingHandler       := handler.NewWhosWorkingHandler(whosWorkingSvc, auditService)
	weeklyReportSvc          := service.NewWeeklyReportService()
	weeklyReportHandler      := handler.NewWeeklyReportHandler(weeklyReportSvc)
	periodReportSvc          := service.NewPeriodReportService(qbtimeTeamRepo, qbtimePeriodCacheRepo, qbtimeUnpaidAddrRepo)
	periodReportHandler      := handler.NewPeriodReportHandler(periodReportSvc)
	qbAccountingHandler      := handler.NewQBAccountingHandler(db)
	catalogHandler           := handler.NewForecastCatalogHandler(db, auditService)
	buildingsHandler         := handler.NewBuildingsHandler(db, auditService)
	aiLLM                   := service.NewOpenRouterClient(cfg.AI.OpenRouterKey, cfg.AI.Model)
	aiClassifierLLM         := service.NewOpenRouterClient(cfg.AI.OpenRouterKey, cfg.AI.ClassifierModel)
	aiChatHandler           := handler.NewAIChatHandler(service.NewAIService(db, aiLLM, aiClassifierLLM, cfg.AI.Model), authService)

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

	// Fuel
	fuel := api.Group("/fuel")
	fuel.Get("/samsara", fuelHandler.ListSamsara)
	fuel.Get("/wex", fuelHandler.ListWex)

	// QBTime Teams
	qbtimeTeams := api.Group("/qbtime/teams")
	qbtimeTeams.Get("/", qbtimeTeamHandler.List)
	qbtimeTeams.Post("/", qbtimeTeamHandler.Create)
	qbtimeTeams.Patch("/:id", qbtimeTeamHandler.Update)
	qbtimeTeams.Delete("/:id", qbtimeTeamHandler.Delete)

	// QBTime Who's Working
	api.Get("/qbtime/whos-working", whosWorkingHandler.Get)

	// QBTime Weekly Report
	api.Get("/qbtime/weekly-report", weeklyReportHandler.Get)

	// QBTime Period Report
	api.Get("/qbtime/period-report/periods",            periodReportHandler.GetPeriods)
	api.Get("/qbtime/period-report/intervals",          periodReportHandler.GetIntervals)
	api.Get("/qbtime/period-report/accounting",         periodReportHandler.GetAccounting)
	api.Get("/qbtime/period-report/addresses",          periodReportHandler.ListAddresses)
	api.Post("/qbtime/period-report/unpaid-addresses",  periodReportHandler.SetUnpaidAddress)
	api.Post("/qbtime/period-report/refresh",           periodReportHandler.Refresh)
	// Sync is cron-guarded (outside RequireAuth) so the scheduler can refresh the cache.
	v1.Post("/qbtime/period-report/sync", middleware.RequireCronOrAdmin(cfg.App.CronSecret, authService), periodReportHandler.Sync)

	// QBTime Workforce Import
	api.Post("/qbtime/workforce-import", qbtWfImportHandler.Import)

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
	ofi.Get("/",                        ofiHandler.List)
	ofi.Get("/monthly-execution",       ofiHandler.ListExecution)
	ofi.Patch("/monthly-execution/:id", ofiHandler.UpdateExecutionReason)
	// POST /calculate is outside RequireAuth so the cron binary can call it with X-Cron-Secret
	v1.Post("/ofi/calculate", middleware.RequireCronOrAdmin(cfg.App.CronSecret, authService), ofiHandler.Calculate)

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

	// Project Monitoring HVAC
	monitoring := api.Group("/project-monitoring")
	monitoring.Get("/", projMonHvacHandler.List)
	monitoring.Get("/:id", projMonHvacHandler.Get)
	monitoring.Post("/", projMonHvacHandler.Create)
	monitoring.Put("/:id", projMonHvacHandler.Update)
	monitoring.Delete("/:id", projMonHvacHandler.Delete)

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
	notifications.Get("/",          notificationHandler.List)
	notifications.Get("/all",       notificationHandler.ListAll)
	notifications.Post("/",         notificationHandler.Create)
	notifications.Put("/:id",       notificationHandler.Update)
	notifications.Patch("/:id/viewed", notificationHandler.MarkViewed)
	notifications.Delete("/:id",    notificationHandler.Delete)

	// Settings (Admin/Dev only)
	settings := api.Group("/settings")
	settings.Get("/screens",                       settingsHandler.GetScreens)
	settings.Get("/users",                         settingsHandler.GetUsers)
	settings.Post("/users",                        settingsHandler.CreateUser)
	settings.Put("/users/:id",                     settingsHandler.UpdateUser)
	settings.Delete("/users/:id",                  settingsHandler.DeleteUser)
	settings.Post("/users/:id/reset-password",     settingsHandler.ResetUserPassword)
	settings.Patch("/users/:id/permissions",       settingsHandler.UpdateUserPermissions)
	settings.Get("/me/permissions",               settingsHandler.GetMyPermissions)

	// Inventory (queries Premium Storage)
	api.Get("/inventory", inventoryHandler.GetInventory)

	// QuickBooks Accounting (protected)
	qbAccounting := api.Group("/qb/accounting")
	qbAccounting.Get("/years",           qbAccountingHandler.Years)
	qbAccounting.Get("/chart",           qbAccountingHandler.Chart)
	qbAccounting.Get("/projects",        qbAccountingHandler.Projects)
	qbAccounting.Get("/projects/detail", qbAccountingHandler.ProjectDetail)

	// Construction Buildings & Schedules
	buildings := api.Group("/buildings")
	buildings.Get("/event-types",            buildingsHandler.ListEventTypes)   // static — must be before /:id
	buildings.Get("/",                       buildingsHandler.ListBuildings)
	buildings.Post("/",                      buildingsHandler.CreateBuilding)
	buildings.Put("/:id",                    buildingsHandler.UpdateBuilding)
	buildings.Delete("/:id",                 buildingsHandler.DeleteBuilding)
	buildings.Get("/:id/schedule",           buildingsHandler.GetSchedule)
	buildings.Post("/:id/schedule",          buildingsHandler.UpsertSchedule)
	buildings.Delete("/:id/schedule",        buildingsHandler.DeleteSchedule)
	buildings.Get("/:id/schedule/history",   buildingsHandler.GetScheduleHistory)
	buildings.Get("/:id/schedule/row-meta",              buildingsHandler.GetScheduleRowMeta)
	buildings.Patch("/:id/schedule/row-meta/:rowId",     buildingsHandler.UpsertScheduleRowMeta)
	buildings.Get("/:id/schedule/row-comments",                buildingsHandler.GetAllRowComments)
	buildings.Get("/:id/schedule/row-comments/:rowId",        buildingsHandler.GetRowComments)
	buildings.Post("/:id/schedule/row-comments/:rowId",       middleware.RequireAuthFull(authService), buildingsHandler.AddRowComment)
	buildings.Patch("/:id/schedule/row-comments/:commentId",  middleware.RequireAuthFull(authService), buildingsHandler.EditRowComment)
	buildings.Delete("/:id/schedule/row-comments/:commentId", middleware.RequireAuthFull(authService), buildingsHandler.DeleteRowComment)
	buildings.Get("/:id/events",             buildingsHandler.GetBuildingEvents)
	buildings.Post("/:id/events",            buildingsHandler.AddBuildingEvent)
	buildings.Patch("/:id/events/:eventId",  buildingsHandler.EditBuildingEvent)
	buildings.Delete("/:id/events/:eventId", buildingsHandler.DeleteBuildingEvent)
	buildings.Get("/:id/trades",             buildingsHandler.GetTradeOwnership)
	buildings.Put("/:id/trades",             buildingsHandler.UpsertTradeOwnership)

	// AI Chat (Aria)
	ai := api.Group("/ai")
	ai.Post("/chat",                              aiChatHandler.Chat)
	ai.Get("/conversations",                      aiChatHandler.ListConversations)
	ai.Delete("/conversations/:id",               aiChatHandler.DeleteConversation)
	ai.Patch("/conversations/:id/title",          aiChatHandler.UpdateTitle)
	ai.Get("/conversations/:id/messages",         aiChatHandler.ListMessages)
	ai.Get("/context/:company",                   aiChatHandler.GetContext)
	ai.Patch("/context/:company",                 aiChatHandler.UpsertContext)

	// QuickBooks OAuth (dev/admin — no auth middleware on callback so QB can redirect)
	qb := v1.Group("/qb")
	qb.Get("/auth",     middleware.RequireAuth(), qbHandler.Auth)
	qb.Get("/callback", qbHandler.Callback)
	qb.Post("/refresh", middleware.RequireAuth(), qbHandler.Refresh)
	qb.Post("/seed",    qbHandler.Seed) // internal bootstrap — no user session needed

	// ── Background Jobs ──────────────────────────────────────────────────────
	jobCtx, jobCancel := context.WithCancel(context.Background())
	defer jobCancel()

	alertsJob := jobs.NewForecastAlertsJob(jobs.ForecastAlertsConfig{
		SMTPHost:     "smtp.gmail.com",
		SMTPPort:     "587",
		GmailUser:    os.Getenv("GMAIL_USER"),
		GmailPass:    os.Getenv("GMAIL_APP_PASSWORD"),
		AlertDays:    15,
		ForecastRepo: forecastRepo,
	})

	qbSyncJob := jobs.NewQBSyncJob(jobs.QBSyncConfig{
		Syncer:   quickbooks.NewSyncer(db),
		OAuthSvc: qbOAuthService,
		Sandbox:  cfg.App.Env != "production",
	})

	qbTimePeriodSyncJob := jobs.NewQBTimePeriodSyncJob(jobs.QBTimePeriodSyncConfig{
		Svc:  periodReportSvc,
		Days: 14,
	})

	scheduler := jobs.NewScheduler(alertsJob, qbSyncJob, qbTimePeriodSyncJob)
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
	return c.Status(code).JSON(fiber.Map{
		"error": err.Error(),
		"code":  "INTERNAL_ERROR",
	})
}
