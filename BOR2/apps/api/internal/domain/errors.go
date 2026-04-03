package domain

import "errors"

var (
	ErrNotFound   = errors.New("not found")
	ErrConflict   = errors.New("already exists")
	ErrForbidden  = errors.New("forbidden")
	ErrBadRequest = errors.New("bad request")
)
