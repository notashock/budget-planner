// Purchase-date recommendation returned by the server
// (POST /api/v1/periods/:year/:month/goals/recommend-date). The app only parses it;
// the recommendation itself is computed by @budget/engine on the server.

class RecommendationResult {
  final String? recommendedDate;
  final int? recommendedDay;
  final bool feasible;
  final int projectedLowestBalance;
  final int savingsBuffer;
  final int? projectedFloorDeficit;
  final String explanation;

  RecommendationResult({
    this.recommendedDate,
    this.recommendedDay,
    required this.feasible,
    required this.projectedLowestBalance,
    required this.savingsBuffer,
    this.projectedFloorDeficit,
    required this.explanation,
  });

  Map<String, dynamic> toMap() => {
    'recommendedDate': recommendedDate,
    'recommendedDay': recommendedDay,
    'feasible': feasible,
    'projectedLowestBalance': projectedLowestBalance,
    'savingsBuffer': savingsBuffer,
    'projectedFloorDeficit': projectedFloorDeficit,
    'explanation': explanation,
  };

  factory RecommendationResult.fromJson(Map<String, dynamic> json) {
    return RecommendationResult(
      recommendedDate: json['recommendedDate']?.toString(),
      recommendedDay: (num.tryParse('${json['recommendedDay']}') ?? 1).toInt(),
      feasible: json['feasible'] == true,
      projectedLowestBalance: (num.tryParse('${json['projectedLowestBalance']}') ?? 0).round(),
      savingsBuffer: (num.tryParse('${json['savingsBuffer']}') ?? 0).round(),
      projectedFloorDeficit: json['projectedFloorDeficit'] != null
          ? (num.tryParse('${json['projectedFloorDeficit']}') ?? 0).round()
          : null,
      explanation: json['explanation']?.toString() ?? '',
    );
  }
}
