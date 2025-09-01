using System.Collections.Generic;

namespace CavityQuest.GameLogic
{
    public class Level
    {
        public int Number { get; set; }
        public List<Monster> Monsters { get; set; } = new();
        public bool IsBossLevel { get; set; } = false;
    }
}
