namespace CavityQuest.GameLogic
{
    public class Monster
    {
        public float X { get; set; }
        public float Y { get; set; }
        public float Width { get; set; } = 40;
        public float Height { get; set; } = 40;
        public int Health { get; set; } = 1;
        public bool IsBoss { get; set; } = false;
        public bool IsAlive => Health > 0;
    }
}

