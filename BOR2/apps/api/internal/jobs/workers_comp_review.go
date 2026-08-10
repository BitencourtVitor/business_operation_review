package jobs

import (
	"context"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/service"
)

func NewWorkersCompReviewJob(review *service.WorkersCompReviewService) Job {
	return Job{
		Name:      "workers-comp-review",
		DailyHour: 12,
		Run: func(ctx context.Context) error {
			return review.RunDaily(ctx, time.Now())
		},
	}
}
