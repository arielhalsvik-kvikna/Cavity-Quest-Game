namespace CavityQuest.GameLogic
{
    public class Player
    {
        public float X { get; set; }
        public float Y { get; set; }
        public float Width { get; set; } = 40;
        public float Height { get; set; } = 40;
        public int Health { get; set; } = 3;
        public int Score { get; set; } = 0;
        public bool IsAlive => Health > 0;
    }
}

