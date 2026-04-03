// Package jobs implements scheduled background tasks that replace
// the Supabase Edge Functions from BOR1.
package jobs

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/pkg/logger"
)

// Job is a function that runs on a schedule.
type Job struct {
	Name     string
	Interval time.Duration
	Run      func(ctx context.Context) error
}

// Scheduler runs background jobs at fixed intervals.
type Scheduler struct {
	jobs []Job
}

func NewScheduler(jobs ...Job) *Scheduler {
	return &Scheduler{jobs: jobs}
}

// Start begins all jobs in separate goroutines.
// It blocks until the context is cancelled.
func (s *Scheduler) Start(ctx context.Context) {
	for _, job := range s.jobs {
		go s.run(ctx, job)
	}
	<-ctx.Done()
	logger.Info("scheduler stopped")
}

func (s *Scheduler) run(ctx context.Context, job Job) {
	logger.Info("job started", "name", job.Name, "interval", job.Interval)

	// Run immediately on startup
	s.execute(ctx, job)

	ticker := time.NewTicker(job.Interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.execute(ctx, job)
		}
	}
}

func (s *Scheduler) execute(ctx context.Context, job Job) {
	start := time.Now()
	if err := job.Run(ctx); err != nil {
		logger.Error("job failed", "name", job.Name, "error", err, "duration", time.Since(start))
		return
	}
	logger.Info("job completed", "name", job.Name, "duration", time.Since(start))
}
