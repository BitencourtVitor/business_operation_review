package jobs

import "testing"

func TestBuilderLogKey(t *testing.T) {
	same := [][2][2]string{
		{{"Willis Brook at Lynnfield, MA", "36"}, {"Willis Brook at Lynnfield, MA", "Lot 36"}},
		{{"Riverview  at East Point", "Building 1"}, {"riverview at east point", "1"}},
		{{"Lakemont at Hudson", "Lot 7"}, {"Lakemont at Hudson", "007"}},
		{{"Woodland Hill", "10 Deck"}, {"Woodland Hill", "010 Deck"}},
	}
	for _, p := range same {
		if a, b := builderLogKey(p[0][0], p[0][1]), builderLogKey(p[1][0], p[1][1]); a != b {
			t.Errorf("%q != %q", a, b)
		}
	}
	if builderLogKey("Bates Quarry", "12") == builderLogKey("Bates Quarry", "21") {
		t.Error("different lots must not match")
	}
}
