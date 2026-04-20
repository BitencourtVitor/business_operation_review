// Package jobs implements scheduled background tasks.
package jobs

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/pkg/logger"
)

// Job is a background task with an interval or a daily schedule.
type Job struct {
	Name    string
	Interval time.Duration // used when DailyHour < 0
	DailyHour int          // UTC hour for daily jobs (-1 = use Interval)
	Run     func(ctx context.Context) error
}

// Scheduler runs background jobs on their defined schedules.
type Scheduler struct {
	jobs []Job
}

func NewScheduler(jobs ...Job) *Scheduler {
	return &Scheduler{jobs: jobs}
}

// Start begins all jobs in separate goroutines and blocks until ctx is cancelled.
func (s *Scheduler) Start(ctx context.Context) {
	for _, job := range s.jobs {
		go s.run(ctx, job)
	}
	<-ctx.Done()
	logger.Info("scheduler stopped")
}

func (s *Scheduler) run(ctx context.Context, job Job) {
	if job.DailyHour >= 0 {
		s.runDaily(ctx, job)
	} else {
		s.runInterval(ctx, job)
	}
}

// runInterval runs a job on a fixed interval, immediately on startup.
func (s *Scheduler) runInterval(ctx context.Context, job Job) {
	logger.Info("job started", "name", job.Name, "interval", job.Interval)
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

// runDaily runs a job once per day at the configured UTC hour.
// It skips the immediate run on startup and waits for the next scheduled time.
func (s *Scheduler) runDaily(ctx context.Context, job Job) {
	logger.Info("job scheduled", "name", job.Name, "daily_utc_hour", job.DailyHour)

	for {
		next := nextDailyRun(job.DailyHour)
		logger.Info("job next run", "name", job.Name, "at", next.Format(time.RFC3339))

		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
			s.execute(ctx, job)
		}
	}
}

// nextDailyRun returns the next occurrence of the given UTC hour (today or tomorrow).
func nextDailyRun(hour int) time.Time {
	now := time.Now().UTC()
	next := time.Date(now.Year(), now.Month(), now.Day(), hour, 0, 0, 0, time.UTC)
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	return next
}

func (s *Scheduler) execute(ctx context.Context, job Job) {
	start := time.Now()
	if err := job.Run(ctx); err != nil {
		logger.Error("job failed", "name", job.Name, "error", err, "duration", time.Since(start))
		return
	}
	logger.Info("job completed", "name", job.Name, "duration", time.Since(start))
}
