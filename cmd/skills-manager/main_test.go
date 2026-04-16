package main

import "testing"

func TestResolvedVersionIsNotEmpty(t *testing.T) {
	if resolvedVersion() == "" {
		t.Fatalf("expected resolved version to be non-empty")
	}
}

