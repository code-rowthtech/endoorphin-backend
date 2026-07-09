# Create complete trainer profile with proper data structure
$baseUrl = "http://localhost:5001"

# Step 1: Login
Write-Host "Step 1: Logging in..." -ForegroundColor Green
$otpBody = @{ phoneNumber = "7897897890"; countryCode = "+91" } | ConvertTo-Json
$otpResponse = Invoke-WebRequest -Uri "$baseUrl/api/auth/send-otp" -Method POST -Body $otpBody -ContentType "application/json" -UseBasicParsing
$otpResult = $otpResponse.Content | ConvertFrom-Json
$otp = $otpResult.data.otp

$verifyBody = @{ phoneNumber = "7897897890"; otp = $otp } | ConvertTo-Json
$verifyResponse = Invoke-WebRequest -Uri "$baseUrl/api/auth/verify-otp" -Method POST -Body $verifyBody -ContentType "application/json" -UseBasicParsing
$verifyResult = $verifyResponse.Content | ConvertFrom-Json

$token = $verifyResult.data.token
$userID = $verifyResult.data.user._id

Write-Host "Logged in as: $($verifyResult.data.user.phoneNumber)" -ForegroundColor Cyan
Write-Host "User ID: $userID" -ForegroundColor Cyan

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Step 2: Create trainer profile with proper service types structure
Write-Host "`nStep 2: Creating trainer profile..." -ForegroundColor Green

$trainerData = @{
    fullName = "Vikram Kumar"
    yearsOfExperience = 5
    shortBio = "Experienced gym trainer with 5 years of expertise in fitness coaching"
    categories = @("Gym Trainer", "Yoga Coach")
    serviceTypes = @(
        @{
            value = "In-Person"
            price = 500
            duration = 60
        },
        @{
            value = "Home Visit"
            price = 750
            duration = 60
        },
        @{
            value = "Gym Facility"
            price = 300
            duration = 45
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "Creating trainer with service types:"
Write-Host $trainerData

try {
    $createResponse = Invoke-WebRequest -Uri "$baseUrl/api/trainers" -Method POST -Headers $headers -Body $trainerData -UseBasicParsing
    $createResult = $createResponse.Content | ConvertFrom-Json
    Write-Host "✓ Trainer profile created!" -ForegroundColor Green
    $trainerProfileID = $createResult.data.profile._id
    Write-Host "Trainer Profile ID: $trainerProfileID" -ForegroundColor Cyan
}
catch {
    Write-Host "✗ Error creating trainer: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Add service areas
Write-Host "`nStep 3: Adding service areas..." -ForegroundColor Green

$areas = @(
    @{
        label = "123 Luxury Lane, Midtown"
        streetAddress = "123 Luxury Lane"
        area = "Midtown"
        city = "New York"
        state = "NY"
        pincode = "10001"
        lat = "40.7128"
        lng = "-74.0060"
    },
    @{
        label = "456 Elite Plaza, Downtown"
        streetAddress = "456 Elite Plaza"
        area = "Downtown"
        city = "New York"
        state = "NY"
        pincode = "10002"
        lat = "40.7150"
        lng = "-74.0070"
    }
)

foreach ($area in $areas) {
    $areaBody = $area | ConvertTo-Json
    try {
        $areaResponse = Invoke-WebRequest -Uri "$baseUrl/api/trainers/$userID/service-areas" -Method POST -Headers $headers -Body $areaBody -UseBasicParsing
        Write-Host "  ✓ $($area.label)" -ForegroundColor Green
    }
    catch {
        Write-Host "  ✗ Error adding $($area.label): $_" -ForegroundColor Red
    }
}

# Step 4: Create services
Write-Host "`nStep 4: Creating services..." -ForegroundColor Green

$services = @(
    "Personal Training Session",
    "Group Fitness Class",
    "Yoga Class",
    "HIIT Training",
    "Strength Training",
    "Flexibility Training",
    "Nutrition Consultation",
    "Fitness Assessment"
)

foreach ($service in $services) {
    $serviceBody = @{
        name = $service
        description = "$service - Professional training session"
        trainerId = $trainerProfileID
    } | ConvertTo-Json
    
    try {
        $serviceResponse = Invoke-WebRequest -Uri "$baseUrl/api/services" -Method POST -Headers $headers -Body $serviceBody -UseBasicParsing
        Write-Host "  ✓ $service" -ForegroundColor Green
    }
    catch {
        Write-Host "  ✗ Error: $service" -ForegroundColor Red
    }
}

# Step 5: Get Dashboard
Write-Host "`nStep 5: Retrieving dashboard..." -ForegroundColor Green
Write-Host "═════════════════════════════════════════" -ForegroundColor Yellow

try {
    $dashResponse = Invoke-WebRequest -Uri "$baseUrl/api/trainers/$userID/dashboard" -Method GET -Headers $headers -UseBasicParsing
    $dash = $dashResponse.Content | ConvertFrom-Json
    
    Write-Host "`nDASHBOARD DATA RETRIEVED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Profile: $($dash.data.trainerInfo.name)" -ForegroundColor Cyan
    Write-Host "Completion: $($dash.data.profileStatus.completionPercent)%" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "STATISTICS:" -ForegroundColor Yellow
    Write-Host "  Service Areas: $($dash.data.stats.serviceAreasCount)"
    Write-Host "  Services: $($dash.data.stats.servicesOfferedCount)"
    Write-Host "  Certifications: $($dash.data.stats.certificationsCount)"
    Write-Host "  Gallery: $($dash.data.stats.galleryImagesCount)"
    Write-Host ""
    Write-Host "SERVICE TYPES WITH PRICING:" -ForegroundColor Yellow
    $dash.data.serviceTypes | ForEach-Object {
        Write-Host "  - $($_.value): Rs. $($_.price) for $($_.duration) min"
    }
    Write-Host ""
    Write-Host "VENUES:" -ForegroundColor Yellow
    $dash.data.venueLocations | ForEach-Object {
        Write-Host "  - $($_.label)"
    }
    Write-Host ""
    Write-Host "═════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host "FULL RESPONSE:" -ForegroundColor Green
    $dash.data | ConvertTo-Json -Depth 30
    
}
catch {
    Write-Host "  ✗ Error getting dashboard: $_ " -ForegroundColor Red
}
