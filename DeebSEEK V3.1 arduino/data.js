const gameData = {
    // 1. بيانات الفرق
    teams: {
        plato: { name: "فريق أفلاطون", logo: "images/team2-logo.jpg" },
        aristotle: { name: "فريق أرسطو", logo: "images/team1-logo.jpg" }
    },

    // 2. بيانات اللاعبين (1 إلى 4 لأفلاطون، 5 إلى 8 لأرسطو)
    players: {
        '1': { name: 'اللاعب الأول', team: 'plato', img: 'images/player1.jpg' },
        '2': { name: 'اللاعب الثاني', team: 'plato', img: 'images/player2.jpg' },
        '3': { name: 'مينا مجدي', team: 'plato', img: 'images/player3.jpg' },
        '4': { name: 'اللاعب الرابع', team: 'plato', img: 'images/player4.jpg' },
        
        '5': { name: 'اللاعب الخامس', team: 'aristotle', img: 'images/player5.jpg' },
        '6': { name: 'اللاعب السادس', team: 'aristotle', img: 'images/player6.jpg' },
        '7': { name: 'اللاعب السابع', team: 'aristotle', img: 'images/player7.jpg' },
        '8': { name: 'اللاعب الثامن', team: 'aristotle', img: 'images/player8.jpg' }
    },

    // 3. بنك الأسئلة (لاحظ إضافة correctAnswer)
    questions: [
        {
            text: "ما هو أطول نهر في العالم؟",
            optA: "أ) نهر النيل",
            optB: "ب) نهر الأمازون",
            optC: "ج) نهر المسيسيبي",
            optD: "د) نهر الفرات",
            correctAnswer: "optA"  // تحديد الإجابة الصحيحة هنا
        },
        {
            text: "أي كوكب يطلق عليه اسم 'الكوكب الأحمر'؟",
            optA: "أ) المشترى",
            optB: "ب) زحل",
            optC: "ج) المريخ",
            optD: "د) الزهرة",
            correctAnswer: "optC"
        },
        {
            text: "من هو مكتشف البنسلين؟",
            optA: "أ) ألكسندر فلمنج",
            optB: "ب) ماري كوري",
            optC: "ج) لويس باستير",
            optD: "د) ألبرت أينشتاين",
            correctAnswer: "optA"
        }
    ]
};