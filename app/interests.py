"""Controlled user interest taxonomy for onboarding and recommendations."""

PREDEFINED_INTERESTS = [
    "beach",
    "nature",
    "waterfall",
    "mountain",
    "hiking",
    "wildlife",
    "national parks",
    "culture",
    "history",
    "museum",
    "monuments",
    "chiefdoms",
    "food",
    "markets",
    "nightlife",
    "business",
    "family",
    "photography",
]


def normalize_interests(values) -> list:
    if not isinstance(values, list):
        return []
    allowed = set(PREDEFINED_INTERESTS)
    normalized = []
    for value in values:
        interest = str(value).strip().lower()
        if interest in allowed and interest not in normalized:
            normalized.append(interest)
    return normalized
