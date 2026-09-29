# Integer Minor Units for Monetary Calculations

JavaScript floating-point arithmetic introduces IEEE 754 precision inaccuracies that can corrupt running balance comparisons against the safety floor. We decided to store and calculate all monetary quantities as integer minor units (1 major currency unit = 100 minor units), formatting to major units only at display time in the UI, and rounding formula item occurrences to whole currency units before scaling to minor units.
