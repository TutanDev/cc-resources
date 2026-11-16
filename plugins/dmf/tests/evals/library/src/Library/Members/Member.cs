namespace Library.Members;

public class Member
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public bool IsJunior { get; set; }
    public decimal UnpaidFines { get; set; }
    public bool IsSuspended { get; set; }
    public DateTime? SuspendedUntil { get; set; }
    public string? SuspensionReason { get; set; }
}
