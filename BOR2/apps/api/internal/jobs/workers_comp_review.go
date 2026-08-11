package jobs

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/service"
)

// The job ticks hourly and the service decides whether this is the hour each
// of its two e-mails is configured for — the schedule lives in Settings →
// Email Triggers, not here.
func NewWorkersCompReviewJob(review *service.WorkersCompReviewService) Job {
	return Job{
		Name:      "workers-comp-review",
		DailyHour: -1,
		Interval:  time.Hour,
		Run: func(ctx context.Context) error {
			return review.RunDaily(ctx, time.Now())
		},
	}
}
