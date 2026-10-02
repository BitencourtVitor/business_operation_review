package handler

import (
	"reflect"
	"testing"
)

func TestCleanNames(t *testing.T) {
	got := cleanNames([]string{" Ana ", "", "ana", "Bruno", "  "})
	want := []string{"Ana", "Bruno"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
